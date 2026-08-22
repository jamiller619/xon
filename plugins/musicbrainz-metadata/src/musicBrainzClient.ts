import {
  CoverArtArchiveApi,
  HttpClient,
  type IFetchOptions,
  type IRecording,
  type IRelease,
  MusicBrainzApi,
} from 'musicbrainz-api'

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org'
const COVER_ART_ARCHIVE_BASE_URL = 'https://coverartarchive.org'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const APP_NAME = 'XonMediaCenter'
const APP_VERSION = '0.1'
const APP_CONTACT_INFO = 'https://github.com/xon-media-center'
const USER_AGENT = `${APP_NAME}/${APP_VERSION} (${APP_CONTACT_INFO})`

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Adapts musicbrainz-api to Xon's permission-checked plugin fetch.
 *
 * musicbrainz-api deliberately owns request construction and rate limiting,
 * but currently creates its HTTP client with global fetch. Keeping this small
 * transport adapter prevents the dependency from bypassing the plugin's
 * declared network permissions.
 */
class SandboxedHttpClient extends HttpClient {
  readonly #baseUrl: string
  readonly #fetchFn: FetchFn
  readonly #rejectHttpErrors: boolean
  readonly #userAgent: string

  constructor(
    baseUrl: string,
    fetchFn: FetchFn,
    userAgent: string,
    rejectHttpErrors = false,
  ) {
    super({ baseUrl, timeout: 500, userAgent })
    this.#baseUrl = baseUrl
    this.#fetchFn = fetchFn
    this.#rejectHttpErrors = rejectHttpErrors
    this.#userAgent = userAgent
  }

  override async get(
    path: string,
    options: IFetchOptions = {},
  ): Promise<Response> {
    const url = new URL(path, `${this.#baseUrl}/`)

    for (const [key, value] of Object.entries(options.query ?? {})) {
      const values = Array.isArray(value) ? value : [value]
      for (const item of values) url.searchParams.append(key, String(item))
    }

    const headers = new Headers(options.headers)
    headers.set('User-Agent', this.#userAgent)

    const response = await this.#fetchFn(url.toString(), {
      method: 'GET',
      headers,
      redirect: options.followRedirects === false ? 'manual' : 'follow',
    })

    if (this.#rejectHttpErrors && !response.ok) {
      throw new Error(
        `MusicBrainz request failed (${response.status}): ${response.statusText}`,
      )
    }

    return response
  }
}

class SandboxedMusicBrainzApi extends MusicBrainzApi {
  constructor(fetchFn: FetchFn) {
    super({
      appName: APP_NAME,
      appVersion: APP_VERSION,
      appContactInfo: APP_CONTACT_INFO,
      // MusicBrainz permits one request per second for anonymous clients.
      rateLimit: [1, 1.1],
    })

    this.httpClient = new SandboxedHttpClient(
      MUSICBRAINZ_BASE_URL,
      fetchFn,
      USER_AGENT,
      true,
    )
  }
}

function createCoverArtApi(fetchFn: FetchFn): CoverArtArchiveApi {
  const api = new CoverArtArchiveApi()

  // CoverArtArchiveApi does not expose transport injection. Its TypeScript
  // private field is a normal property at runtime, so install the same
  // permission-checked adapter used by MusicBrainzApi.
  ;(
    api as unknown as {
      httpClient: HttpClient
    }
  ).httpClient = new SandboxedHttpClient(
    COVER_ART_ARCHIVE_BASE_URL,
    fetchFn,
    USER_AGENT,
  )

  return api
}

export interface MusicBrainzArtist {
  mbid: string
  name: string
  sortName: string
}

export interface MusicBrainzMetadata {
  recordingMbid: string
  releaseMbid: string | null
  title: string
  artists: MusicBrainzArtist[]
  album: string | null
  releaseYear: string | null
  genres: string[]
  label: string | null
  catalogNumber: string | null
  coverArtUrl: string | null
  isCompilation: boolean
  durationMs: number | null
}

export class MusicBrainzClient {
  readonly #musicBrainzApi: MusicBrainzApi
  readonly #coverArtApi: CoverArtArchiveApi
  readonly #cache = new Map<string, CacheEntry<unknown>>()

  constructor(fetchFn: FetchFn) {
    this.#musicBrainzApi = new SandboxedMusicBrainzApi(fetchFn)
    this.#coverArtApi = createCoverArtApi(fetchFn)
  }

  /** Searches for a recording by title and optional artist/album. */
  async searchRecording(
    title: string,
    artist?: string,
    album?: string,
  ): Promise<MusicBrainzMetadata | null> {
    const query: Record<string, string> = { recording: title }
    if (artist) query.artist = artist
    if (album) query.release = album

    try {
      return await this.#cached(
        `recording:${JSON.stringify(query)}`,
        async () => {
          const result = await this.#musicBrainzApi.search('recording', {
            query,
            limit: 5,
            inc: ['artist-credits', 'releases', 'genres'],
          })
          const recording = result.recordings[0]
          return recording ? this.#recordingToMetadata(recording) : null
        },
      )
    } catch {
      return null
    }
  }

  /** Fetches detailed release info including labels, genres, and cover art. */
  async fetchReleaseDetails(
    releaseMbid: string,
  ): Promise<Partial<MusicBrainzMetadata> | null> {
    try {
      return await this.#cached(`release:${releaseMbid}`, async () => {
        const release = await this.#musicBrainzApi.lookup(
          'release',
          releaseMbid,
          ['artist-credits', 'labels', 'genres', 'release-groups'],
        )
        const labelInfo = release['label-info']?.[0]
        const genres = this.#topGenres(release)
        const releaseGroup = release['release-group']
        const secondaryTypes = releaseGroup?.['secondary-types'] ?? []
        const isCompilation =
          releaseGroup?.['primary-type'] === 'Compilation' ||
          secondaryTypes.includes('Compilation') ||
          (release['artist-credit'] ?? []).some(
            (credit) => credit.artist.name.toLowerCase() === 'various artists',
          )

        return {
          label: labelInfo?.label?.name ?? null,
          catalogNumber: labelInfo?.['catalog-number'] ?? null,
          genres,
          isCompilation,
          coverArtUrl: await this.fetchCoverArtUrl(releaseMbid),
        }
      })
    } catch {
      return null
    }
  }

  /** Returns the Cover Art Archive's front-cover URL when one exists. */
  async fetchCoverArtUrl(releaseMbid: string): Promise<string | null> {
    try {
      return await this.#cached(`cover:${releaseMbid}`, async () => {
        const cover = await this.#coverArtApi.getReleaseCover(
          releaseMbid,
          'front',
        )
        return cover.url
      })
    } catch {
      return null
    }
  }

  #recordingToMetadata(recording: IRecording): MusicBrainzMetadata {
    const artists: MusicBrainzArtist[] = (recording['artist-credit'] ?? []).map(
      (credit) => ({
        mbid: credit.artist.id,
        name: credit.name || credit.artist.name,
        sortName: credit.artist['sort-name'],
      }),
    )

    const primaryRelease = recording.releases?.[0]
    const releaseDate = primaryRelease?.date || null

    return {
      recordingMbid: recording.id,
      releaseMbid: primaryRelease?.id ?? null,
      title: recording.title,
      artists,
      album: primaryRelease?.title ?? null,
      releaseYear: releaseDate ? releaseDate.slice(0, 4) : null,
      genres: this.#topGenres(recording),
      label: null,
      catalogNumber: null,
      coverArtUrl: null,
      isCompilation:
        artists.some(
          (artist) => artist.name.toLowerCase() === 'various artists',
        ) || artists.length > 1,
      durationMs: recording.length ?? null,
    }
  }

  #topGenres(entity: Pick<IRecording | IRelease, 'genres'>): string[] {
    return [...(entity.genres ?? [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((genre) => genre.name)
  }

  async #cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.#cache.get(key) as CacheEntry<T> | undefined
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await load()
    this.#cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  clearCache(): void {
    this.#cache.clear()
  }
}
