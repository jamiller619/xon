const MB_BASE = 'https://musicbrainz.org/ws/2'
const CAA_BASE = 'https://coverartarchive.org'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
// MusicBrainz requires at least 1 request per second for anonymous users
const RATE_LIMIT_MS = 1100

const USER_AGENT = 'XonMediaCenter/1.0 (https://github.com/xon-media-center)'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

// ─── MusicBrainz API response shapes ────────────────────────────────────────

interface MbArtistCredit {
  artist: {
    id: string
    name: string
    'sort-name': string
  }
  name: string
  joinphrase: string
}

interface MbLabel {
  id: string
  name: string
}

interface MbLabelInfo {
  label: MbLabel | null
  'catalog-number': string | null
}

interface MbGenre {
  id: string
  name: string
  count: number
}

interface MbReleaseGroup {
  id: string
  title: string
  'primary-type': string | null
  'secondary-types': string[]
}

interface MbRelease {
  id: string
  title: string
  date: string
  'artist-credit': MbArtistCredit[]
  'label-info': MbLabelInfo[]
  genres?: MbGenre[]
  'release-group'?: MbReleaseGroup
}

interface MbRecording {
  id: string
  title: string
  length: number | null
  'artist-credit': MbArtistCredit[]
  releases: MbRelease[]
  genres?: MbGenre[]
}

interface MbSearchResult<T> {
  count: number
  offset: number
  recordings?: T[]
  releases?: T[]
}

// ─── Public types ────────────────────────────────────────────────────────────

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

// ─── Rate limiter ────────────────────────────────────────────────────────────

class RateLimiter {
  private lastRequestAt = 0
  private queue: Array<() => void> = []
  private processing = false

  async throttle(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
      if (!this.processing) {
        this.processQueue()
      }
    })
  }

  private processQueue(): void {
    this.processing = true
    const next = this.queue.shift()
    if (!next) {
      this.processing = false
      return
    }

    const now = Date.now()
    const elapsed = now - this.lastRequestAt
    const delay = Math.max(0, RATE_LIMIT_MS - elapsed)

    setTimeout(() => {
      this.lastRequestAt = Date.now()
      next()
      this.processQueue()
    }, delay)
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class MusicBrainzClient {
  private readonly fetchFn: FetchFn
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly rateLimiter = new RateLimiter()

  constructor(fetchFn: FetchFn) {
    this.fetchFn = fetchFn
  }

  private async get<T>(url: string): Promise<T | null> {
    const cached = this.cache.get(url) as CacheEntry<T> | undefined
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      return cached.data
    }

    await this.rateLimiter.throttle()

    const res = await this.fetchFn(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (!res.ok) return null

    const data = (await res.json()) as T
    this.cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  /**
   * Searches for a recording by title and optional artist/album.
   */
  async searchRecording(
    title: string,
    artist?: string,
    album?: string,
  ): Promise<MusicBrainzMetadata | null> {
    const parts: string[] = [`recording:"${title}"`]
    if (artist) parts.push(`artist:"${artist}"`)
    if (album) parts.push(`release:"${album}"`)

    const query = parts.join(' AND ')
    const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5&inc=artist-credits+releases+genres`

    const result = await this.get<MbSearchResult<MbRecording>>(url)
    const recording = result?.recordings?.[0]
    if (!recording) return null

    return this.recordingToMetadata(recording)
  }

  /**
   * Fetches detailed release info including labels, genres, and cover art.
   */
  async fetchReleaseDetails(
    releaseMbid: string,
  ): Promise<Partial<MusicBrainzMetadata> | null> {
    const url = `${MB_BASE}/release/${releaseMbid}?fmt=json&inc=artist-credits+labels+genres+release-groups`
    const release = await this.get<MbRelease>(url)
    if (!release) return null

    const labelInfo = release['label-info']?.[0]
    const label = labelInfo?.label?.name ?? null
    const catalogNumber = labelInfo?.['catalog-number'] ?? null
    const genres = (release.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((g) => g.name)

    const releaseGroup = release['release-group']
    const secondaryTypes = releaseGroup?.['secondary-types'] ?? []
    const isCompilation =
      releaseGroup?.['primary-type'] === 'Compilation' ||
      secondaryTypes.includes('Compilation') ||
      release['artist-credit'].some(
        (ac) => ac.artist.name.toLowerCase() === 'various artists',
      )

    const coverArtUrl = await this.fetchCoverArtUrl(releaseMbid)

    return { label, catalogNumber, genres, isCompilation, coverArtUrl }
  }

  /**
   * Attempts to get a cover art URL from the Cover Art Archive.
   * Returns null if no cover art is available.
   */
  async fetchCoverArtUrl(releaseMbid: string): Promise<string | null> {
    const url = `${CAA_BASE}/release/${releaseMbid}/front-250`
    // CAA returns a redirect; we just need to check if the endpoint exists.
    // We return the constructed URL directly — the browser/client can follow the redirect.
    // To verify it exists, we make a HEAD request.
    await this.rateLimiter.throttle()
    try {
      const res = await this.fetchFn(url, { method: 'HEAD' })
      if (
        res.ok ||
        res.status === 307 ||
        res.status === 302 ||
        res.status === 301
      ) {
        return url
      }
    } catch {
      // Network error — no cover art
    }
    return null
  }

  private recordingToMetadata(recording: MbRecording): MusicBrainzMetadata {
    const artists: MusicBrainzArtist[] = recording['artist-credit'].map(
      (ac) => ({
        mbid: ac.artist.id,
        name: ac.name || ac.artist.name,
        sortName: ac.artist['sort-name'],
      }),
    )

    const primaryRelease = recording.releases?.[0]
    const releaseMbid = primaryRelease?.id ?? null
    const album = primaryRelease?.title ?? null
    const releaseDate = primaryRelease?.date ?? null
    const releaseYear = releaseDate ? releaseDate.slice(0, 4) : null

    const genres = (recording.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((g) => g.name)

    const isCompilation =
      artists.some((a) => a.name.toLowerCase() === 'various artists') ||
      artists.length > 1

    return {
      recordingMbid: recording.id,
      releaseMbid,
      title: recording.title,
      artists,
      album,
      releaseYear,
      genres,
      label: null,
      catalogNumber: null,
      coverArtUrl: null,
      isCompilation,
      durationMs: recording.length ?? null,
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}
