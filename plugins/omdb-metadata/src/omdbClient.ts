import type { Metadata } from '@xon/shared'

const OMDB_BASE = 'https://www.omdbapi.com/'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface OmdbRating {
  Source: string
  Value: string
}

/** Raw OMDb API response for movies, series, and episodes */
export interface OmdbResult {
  Title: string
  Year: string
  Rated: string
  Released: string
  Runtime: string
  Genre: string
  Director: string
  Writer: string
  Actors: string
  Plot: string
  Language: string
  Country: string
  Awards: string
  Poster: string
  Ratings?: OmdbRating[]
  Metascore: string
  imdbRating: string
  imdbVotes: string
  imdbID: string
  Type: 'movie' | 'series' | 'episode'
  DVD?: string
  BoxOffice?: string
  Production?: string
  Website?: string
  // Episode-only fields
  seriesID?: string
  Season?: string
  Episode?: string
  Response: 'True' | 'False'
  Error?: string
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export class OmdbClient {
  readonly #apiKey: string
  readonly #fetchFn: FetchFn
  readonly #cache = new Map<string, CacheEntry<OmdbResult | null>>()

  constructor(apiKey: string, fetchFn: FetchFn) {
    this.#apiKey = apiKey
    this.#fetchFn = fetchFn
  }

  async #get(params: Record<string, string>): Promise<OmdbResult | null> {
    const cacheKey = JSON.stringify(params)
    const cached = this.#cache.get(cacheKey)
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      return cached.data
    }

    const url = new URL(OMDB_BASE)
    url.searchParams.set('apikey', this.#apiKey)
    url.searchParams.set('plot', 'full')
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const res = await this.#fetchFn(url.toString())
    if (!res.ok) return null

    const data = (await res.json()) as OmdbResult
    const result = data.Response === 'True' ? data : null
    this.#cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
    return result
  }

  /** Look up any title (movie, series, or episode) directly by its IMDb id */
  async fetchByImdbId(imdbId: string): Promise<Metadata | undefined> {
    const result = await this.#get({ i: imdbId })
    return result ? toMetadata(result) : undefined
  }

  async fetchMovieMetadata(
    title: string,
    year?: number,
  ): Promise<Metadata | undefined> {
    const params: Record<string, string> = { t: title, type: 'movie' }
    if (year != null) params.y = String(year)

    const result = await this.#get(params)
    return result ? toMetadata(result) : undefined
  }

  async fetchSeriesMetadata(
    title: string,
    year?: number,
  ): Promise<Metadata | undefined> {
    const params: Record<string, string> = { t: title, type: 'series' }
    if (year != null) params.y = String(year)

    const result = await this.#get(params)
    return result ? toMetadata(result) : undefined
  }

  async fetchEpisodeMetadata(
    seriesTitle: string,
    season: number,
    episode: number,
  ): Promise<Metadata | undefined> {
    const result = await this.#get({
      t: seriesTitle,
      Season: String(season),
      Episode: String(episode),
    })
    return result ? toMetadata(result) : undefined
  }

  clearCache(): void {
    this.#cache.clear()
  }
}

/** OMDb uses the literal string "N/A" for missing fields */
function present(value: string | undefined): string | undefined {
  return value && value !== 'N/A' ? value : undefined
}

function splitList(value: string | undefined): string[] | undefined {
  const v = present(value)
  return v?.split(',').map((s) => s.trim())
}

function toNumber(value: string | undefined): number | undefined {
  const v = present(value)?.replace(/[,%]/g, '').replace(/ min$/, '')
  if (v == null) return undefined

  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? undefined : n
}

function toIsoDate(value: string | undefined): string | undefined {
  const v = present(value)
  if (v == null) return undefined

  const date = new Date(v)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10)
}

function toMetadata(result: OmdbResult): Metadata {
  const data: Metadata = {
    imdbId: result.imdbID,
    title: present(result.Title),
    overview: present(result.Plot),
    releaseDate: toIsoDate(result.Released),
    rated: present(result.Rated),
    runtime: toNumber(result.Runtime),
    genres: splitList(result.Genre),
    directors: splitList(result.Director),
    writers: splitList(result.Writer),
    actors: splitList(result.Actors),
    language: present(result.Language),
    country: present(result.Country),
    awards: present(result.Awards),
    boxOffice: present(result.BoxOffice),
    imdbRating: toNumber(result.imdbRating),
    imdbVotes: toNumber(result.imdbVotes),
    metascore: toNumber(result.Metascore),
    rottenTomatoesRating: toNumber(
      result.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value,
    ),
  }

  if (result.Type === 'episode') {
    data.episodeTitle = present(result.Title)
    data.seasonNumber = toNumber(result.Season)
    data.episodeNumber = toNumber(result.Episode)
    if (result.seriesID) data.seriesImdbId = result.seriesID
  }

  // Strip undefined values so Object.assign merges cleanly downstream
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key]
  }

  return data
}
