import {
  CoverArtArchiveApi,
  HttpClient,
  type IFetchOptions,
  type IRecording,
  type IRelease,
  type ITrack,
  MusicBrainzApi,
} from 'musicbrainz-api'

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org'
const COVER_ART_ARCHIVE_BASE_URL = 'https://coverartarchive.org'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const HTTP_RETRY_DELAY_MS = 500
const HTTP_REQUEST_TIMEOUT_MS = 10_000
const MUSICBRAINZ_REQUEST_INTERVAL_MS = 1_100

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
 * musicbrainz-api owns request construction and supplies the retry policy, but
 * currently creates its HTTP client with global fetch. This adapter preserves
 * Xon's network permissions while serializing the actual requests so concurrent
 * scanner jobs cannot burst past MusicBrainz's anonymous-client limit.
 */
class SandboxedHttpClient extends HttpClient {
  readonly #baseUrl: string
  readonly #fetchFn: FetchFn
  readonly #rejectHttpErrors: boolean
  readonly #userAgent: string
  readonly #requestIntervalMs: number
  #nextRequestAt = 0
  #requestQueue: Promise<void> = Promise.resolve()

  constructor(
    baseUrl: string,
    fetchFn: FetchFn,
    userAgent: string,
    rejectHttpErrors = false,
    requestIntervalMs = 0,
  ) {
    super({ baseUrl, timeout: 500, userAgent })
    this.#baseUrl = baseUrl
    this.#fetchFn = fetchFn
    this.#rejectHttpErrors = rejectHttpErrors
    this.#userAgent = userAgent
    this.#requestIntervalMs = requestIntervalMs
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

    return this.#enqueue(async () => {
      let retriesRemaining =
        options.retryLimit && options.retryLimit > 1 ? options.retryLimit : 1
      let response: Response

      do {
        const waitMs = Math.max(0, this.#nextRequestAt - Date.now())
        if (waitMs > 0) await delay(waitMs)

        this.#nextRequestAt = Date.now() + this.#requestIntervalMs
        const abortController = new AbortController()
        const timeout = setTimeout(
          () =>
            abortController.abort(
              new Error(
                `MusicBrainz request timed out after ${HTTP_REQUEST_TIMEOUT_MS}ms`,
              ),
            ),
          HTTP_REQUEST_TIMEOUT_MS,
        )
        try {
          response = await this.#fetchFn(url.toString(), {
            method: 'GET',
            headers,
            redirect: options.followRedirects === false ? 'manual' : 'follow',
            signal: abortController.signal,
          })
        } finally {
          clearTimeout(timeout)
        }

        if (response.status !== 429 && response.status !== 503) break

        retriesRemaining--
        if (retriesRemaining > 0) await delay(HTTP_RETRY_DELAY_MS)
      } while (retriesRemaining > 0)

      if (this.#rejectHttpErrors && !response.ok) {
        throw new Error(
          `MusicBrainz request failed (${response.status}): ${response.statusText}`,
        )
      }

      return response
    })
  }

  async #enqueue<T>(request: () => Promise<T>): Promise<T> {
    const previousRequest = this.#requestQueue
    let releaseQueue: () => void = () => undefined
    this.#requestQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve
    })

    await previousRequest
    try {
      return await request()
    } finally {
      releaseQueue()
    }
  }
}

class SandboxedMusicBrainzApi extends MusicBrainzApi {
  constructor(fetchFn: FetchFn) {
    super({
      appName: APP_NAME,
      appVersion: APP_VERSION,
      appContactInfo: APP_CONTACT_INFO,
      // The sandbox transport below owns serialization and request spacing.
      // Disabling the package limiter avoids a second queue that releases
      // concurrent scanner requests in batches.
      disableRateLimiting: true,
    })

    this.httpClient = new SandboxedHttpClient(
      MUSICBRAINZ_BASE_URL,
      fetchFn,
      USER_AGENT,
      true,
      MUSICBRAINZ_REQUEST_INTERVAL_MS,
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
  images?: { poster: string[] }
}

export interface AlbumTrackSearch {
  album: string
  albumArtist: string
  title: string
  year?: number
  discNumber?: number
  trackNumber?: number
  durationMs?: number
}

interface AlbumReleaseMatch {
  release: IRelease
  coverArtUrl: string | null
}

export class MusicBrainzClient {
  readonly #musicBrainzApi: MusicBrainzApi
  readonly #coverArtApi: CoverArtArchiveApi
  readonly #cache = new Map<string, CacheEntry<unknown>>()
  readonly #inFlight = new Map<string, Promise<unknown>>()

  constructor(fetchFn: FetchFn) {
    this.#musicBrainzApi = new SandboxedMusicBrainzApi(fetchFn)
    this.#coverArtApi = createCoverArtApi(fetchFn)
  }

  /** Resolves a complete release once, then matches a track from its media list. */
  async searchAlbumTrack(
    query: AlbumTrackSearch,
  ): Promise<MusicBrainzMetadata | null> {
    const album = await this.#searchAlbumRelease(
      query.album,
      query.albumArtist,
      query.year,
    )
    if (!album) return null

    const track = this.#matchAlbumTrack(album.release, query)
    if (!track) return null

    const recording = track['artist-credit']?.length
      ? { ...track.recording, 'artist-credit': track['artist-credit'] }
      : track.recording
    return this.#recordingToMetadata(
      recording,
      album.release,
      album.coverArtUrl,
    )
  }

  /** Searches for a recording by title and optional artist/album. */
  async searchRecording(
    title: string,
    artist?: string,
    album?: string,
  ): Promise<MusicBrainzMetadata | null> {
    const strictMatch = await this.#searchRecording(title, artist, album)
    if (strictMatch || !album) return strictMatch

    // Folder names and embedded tags often contain edition/source suffixes that
    // do not match MusicBrainz's canonical release title. Keep album useful for
    // disambiguation, but do not let it prevent a strong title/artist match.
    return this.#searchRecording(title, artist)
  }

  async #searchRecording(
    title: string,
    artist?: string,
    album?: string,
  ): Promise<MusicBrainzMetadata | null> {
    const query: Record<string, string> = { recording: title }
    if (artist) query.artist = artist
    if (album) query.release = album

    return this.#cached(`recording:${JSON.stringify(query)}`, async () => {
      const result = await this.#musicBrainzApi.search('recording', {
        query,
        limit: 5,
        inc: ['artist-credits', 'releases', 'genres'],
      })
      const recording = result.recordings[0]
      return recording ? this.#recordingToMetadata(recording) : null
    })
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

  async #searchAlbumRelease(
    album: string,
    albumArtist: string,
    year?: number,
  ): Promise<AlbumReleaseMatch | null> {
    const cacheKey = `album:${JSON.stringify({ album, albumArtist, year })}`
    return this.#cached(cacheKey, async () => {
      const result = await this.#musicBrainzApi.search('release', {
        query: { release: album, artist: albumArtist },
        limit: 10,
        inc: ['artist-credits', 'release-groups'],
      })
      const releases = result.releases
      const candidate =
        (year
          ? releases.find((release) => release.date?.startsWith(String(year)))
          : undefined) ??
        releases.find((release) => release.status === 'Official') ??
        releases[0]
      if (!candidate) return null

      const release = await this.#musicBrainzApi.lookup(
        'release',
        candidate.id,
        ['recordings', 'artist-credits', 'labels', 'genres', 'release-groups'],
      )
      return {
        release,
        coverArtUrl: await this.fetchCoverArtUrl(release.id),
      }
    })
  }

  #matchAlbumTrack(release: IRelease, query: AlbumTrackSearch): ITrack | null {
    const tracks = (release.media ?? []).flatMap((medium) =>
      (medium.tracks ?? []).map((track) => ({ medium, track })),
    )
    if (tracks.length === 0) return null

    const discNumber = query.discNumber ?? 1
    const numbered = query.trackNumber
      ? tracks.filter(
          ({ medium, track }) =>
            medium.position === discNumber &&
            (track.position === query.trackNumber ||
              Number.parseInt(track.number, 10) === query.trackNumber),
        )
      : []
    const titleKey = normalizedTrackTitle(query.title)
    const titled = tracks.filter(
      ({ track }) => normalizedTrackTitle(track.title) === titleKey,
    )
    const numberedWithTitle = numbered.filter(
      ({ track }) => normalizedTrackTitle(track.title) === titleKey,
    )
    const candidates =
      numberedWithTitle.length > 0
        ? numberedWithTitle
        : titled.length > 0
          ? titled
          : numbered
    if (candidates.length === 0) return null

    const durationMs = query.durationMs
    if (durationMs) {
      const durationMatch = candidates.find(({ track }) => {
        const candidateDuration = track.length ?? track.recording.length
        return (
          typeof candidateDuration === 'number' &&
          Math.abs(candidateDuration - durationMs) <= 10_000
        )
      })
      if (durationMatch) return durationMatch.track
    }

    return (
      candidates.find(
        ({ track }) => normalizedTrackTitle(track.title) === titleKey,
      )?.track ??
      candidates[0]?.track ??
      null
    )
  }

  #recordingToMetadata(
    recording: IRecording,
    releaseOverride?: IRelease,
    coverArtUrl: string | null = null,
  ): MusicBrainzMetadata {
    const artists: MusicBrainzArtist[] = (recording['artist-credit'] ?? []).map(
      (credit) => ({
        mbid: credit.artist.id,
        name: credit.name || credit.artist.name,
        sortName: credit.artist['sort-name'],
      }),
    )

    const primaryRelease = releaseOverride ?? recording.releases?.[0]
    const releaseDate = primaryRelease?.date || null
    const labelInfo = primaryRelease?.['label-info']?.[0]
    const releaseGroup = primaryRelease?.['release-group']
    const secondaryTypes = releaseGroup?.['secondary-types'] ?? []
    const genres = this.#topGenres(primaryRelease ?? recording)

    return {
      recordingMbid: recording.id,
      releaseMbid: primaryRelease?.id ?? null,
      title: recording.title,
      artists,
      album: primaryRelease?.title ?? null,
      releaseYear: releaseDate ? releaseDate.slice(0, 4) : null,
      genres: genres.length > 0 ? genres : this.#topGenres(recording),
      label: labelInfo?.label?.name ?? null,
      catalogNumber: labelInfo?.['catalog-number'] ?? null,
      coverArtUrl,
      isCompilation:
        releaseGroup?.['primary-type'] === 'Compilation' ||
        secondaryTypes.includes('Compilation') ||
        artists.some(
          (artist) => artist.name.toLowerCase() === 'various artists',
        ) ||
        artists.length > 1,
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

    const pending = this.#inFlight.get(key) as Promise<T> | undefined
    if (pending) return pending

    const request = load()
      .then((data) => {
        this.#cache.set(key, {
          data,
          expiresAt: Date.now() + CACHE_TTL_MS,
        })
        return data
      })
      .finally(() => {
        this.#inFlight.delete(key)
      })
    this.#inFlight.set(key, request)
    return request
  }

  clearCache(): void {
    this.#cache.clear()
    this.#inFlight.clear()
  }
}

function normalizedTrackTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
