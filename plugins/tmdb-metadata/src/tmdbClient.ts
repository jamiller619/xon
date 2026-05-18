import type { Metadata } from '@xon/shared'
import { backdropSizes, posterSizes, secureBaseURL } from './config.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface TmdbCastMember {
  id: number
  name: string
  character: string
  order: number
}

export interface TmdbCrewMember {
  id: number
  name: string
  job: string
  department: string
}

export interface TmdbMovieMetadata {
  tmdbId: number
  title: string
  originalTitle: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string
  voteAverage: number
  genres: string[]
  cast: TmdbCastMember[]
  crew: TmdbCrewMember[]
}

export interface TmdbTvMetadata {
  tmdbId: number
  seriesId: number
  title: string
  originalTitle: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  firstAirDate: string
  voteAverage: number
  genres: string[]
  cast: TmdbCastMember[]
  crew: TmdbCrewMember[]
  seasonNumber: number
  episodeNumber: number
  episodeTitle?: string
  episodeOverview?: string
  episodeStillPath?: string
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

// Internal TMDb API response shapes
interface TmdbMovieSearchResult {
  id: number
  title: string
  original_title: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
}

interface TmdbMovieDetailsResult extends TmdbMovieSearchResult {
  adult: boolean
  imdb_id: string
  overview: string
  genres: Array<{ id: number; name: string }>
  credits: {
    cast: Array<{ id: number; name: string; character: string; order: number }>
    crew: Array<{ id: number; name: string; job: string; department: string }>
  }
}

interface TmdbTvSearchResult {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
}

interface TmdbTvDetailsResult extends TmdbTvSearchResult {
  genres: Array<{ id: number; name: string }>
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number }>
    crew: Array<{ id: number; name: string; job: string; department: string }>
  }
}

interface TmdbEpisodeResult {
  id: number
  name: string
  overview: string
  still_path: string | null
  season_number: number
  episode_number: number
}

interface SearchResponse<T> {
  results: T[]
}

interface TmdbPersonImage {
  file_path: string
  aspect_ratio: number
  width: number
  height: number
  iso_639_1: string
  vote_average: number
  vote_count: number
}

interface TmdbPersonImagesResult {
  profiles: TmdbPersonImage[]
}

const KEY_JOBS = new Set([
  'Director',
  'Producer',
  'Writer',
  'Executive Producer',
  'Creator',
])

export class TmdbClient {
  readonly #apiKey: string
  readonly #fetchFn: FetchFn
  readonly #cache = new Map<string, CacheEntry<unknown>>()

  constructor(apiKey: string, fetchFn: FetchFn) {
    this.#apiKey = apiKey
    this.#fetchFn = fetchFn
  }

  async #get<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T | null> {
    const cacheKey = `${path}|${JSON.stringify(params)}`
    const cached = this.#cache.get(cacheKey) as CacheEntry<T> | undefined
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      return cached.data
    }

    const url = new URL(`${TMDB_BASE}${path}`)
    url.searchParams.set('api_key', this.#apiKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const res = await this.#fetchFn(url.toString())
    if (!res.ok) return null

    const data = (await res.json()) as T
    this.#cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  async fetchPersonImages(personId: number) {
    return this.#get<TmdbPersonImagesResult>(`/person/${personId}/images`)
  }

  async searchMovies(
    title: string,
    year?: number,
  ): Promise<SearchResponse<TmdbMovieSearchResult> | null> {
    const params: Record<string, string> = { query: title }
    if (year !== undefined) params.year = String(year)

    return this.#get<SearchResponse<TmdbMovieSearchResult>>(
      '/search/movie',
      params,
    )
  }

  async fetchMovieMetadata(
    title: string,
    year?: number,
  ): Promise<Metadata | null> {
    const search = await this.searchMovies(title, year)
    const first = search?.results[0]
    if (!first) return null

    const details = await this.#get<TmdbMovieDetailsResult>(
      `/movie/${first.id}`,
      {
        append_to_response: 'credits',
      },
    )

    if (!details) return null

    const data: Metadata = {
      adult: details.adult,
      tmdbId: details.id,
      imdbId: details.imdb_id,
      title: details.title,
      originalTitle: details.original_title,
      overview: details.overview,
      releaseDate: details.release_date,
      voteAverage: details.vote_average,
      genres: details.genres.map((g) => g.name),
      cast: details.credits.cast.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        order: c.order,
      })),
      crew: details.credits.crew
        .filter((c) => KEY_JOBS.has(c.job))
        .map((c) => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
        })),
    }

    if (details.backdrop_path) {
      data.images ??= {}
      data.images.backdrop = constructURL(
        backdropSizes.large,
        details.backdrop_path,
      )
    }

    if (details.poster_path) {
      data.images ??= {}
      data.images.poster = constructURL(posterSizes.xlarge, details.poster_path)
    }

    return data
  }

  async fetchTvMetadata(
    seriesTitle: string,
    season: number,
    episode: number,
  ): Promise<Metadata | null> {
    const search = await this.#get<SearchResponse<TmdbTvSearchResult>>(
      '/search/tv',
      {
        query: seriesTitle,
      },
    )
    const first = search?.results[0]
    if (!first) return null

    const details = await this.#get<TmdbTvDetailsResult>(`/tv/${first.id}`, {
      append_to_response: 'credits',
    })
    if (!details) return null

    const episodeDetails = await this.#get<TmdbEpisodeResult>(
      `/tv/${first.id}/season/${season}/episode/${episode}`,
    )

    const cast = details.credits?.cast ?? []
    const crew = details.credits?.crew ?? []

    const metadata: Metadata = {
      tmdbId: first.id,
      seriesId: first.id,
      title: details.name,
      originalTitle: details.original_name,
      overview: details.overview,
      firstAirDate: details.first_air_date,
      voteAverage: details.vote_average,
      genres: details.genres.map((g) => g.name),
      cast: cast.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        order: c.order,
      })),
      crew: crew
        .filter((c) => KEY_JOBS.has(c.job))
        .map((c) => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
        })),
      seasonNumber: season,
      episodeNumber: episode,
    }

    if (details.poster_path) {
      metadata.images ??= {}
      metadata.images.poster = constructURL(
        posterSizes.xlarge,
        details.poster_path,
      )
    }

    if (details.backdrop_path) {
      metadata.images ??= {}
      metadata.images.backdrop = constructURL(
        backdropSizes.large,
        details.backdrop_path,
      )
    }

    if (episodeDetails) {
      metadata.episodeTitle = episodeDetails.name
      metadata.episodeOverview = episodeDetails.overview
      if (episodeDetails.still_path !== null) {
        metadata.episodeStillPath = episodeDetails.still_path
      }
    }

    return metadata
  }

  clearCache(): void {
    this.#cache.clear()
  }
}

function constructURL(size: string, imagePath: string) {
  return new URL(`${size}${imagePath}`, secureBaseURL).href
}
