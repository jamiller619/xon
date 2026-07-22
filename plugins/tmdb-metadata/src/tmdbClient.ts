import type { Metadata } from '@xon/shared'
import {
  backdropSizes,
  logoSizes,
  posterSizes,
  profileSizes,
  secureBaseURL,
} from './config.js'

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
  external_ids?: {
    imdb_id?: string | null
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

interface FindResponse {
  movie_results: TmdbMovieSearchResult[]
  tv_results: TmdbTvSearchResult[]
}

interface TmdbPersonImagesResult {
  profiles: ImageResult[]
}

export interface ImageResult {
  aspect_ratio: number
  file_path: string
  height: number
  iso_639_1: string | null
  vote_average: number
  vote_count: number
  width: number
}

export interface PersonImageResult {
  url: string
  personId: number
}

interface TmdbMovieImagesResult {
  backdrops: ImageResult[]
  logos: ImageResult[]
  posters: ImageResult[]
}

export interface MovieSearchResult {
  tmdbId: number
  title: string
  poster: string
  releaseDate: string
}

export interface TvSearchResult {
  tmdbId: number
  title: string
  poster: string
  firstAirDate: string
  overview: string
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

  async fetchPersonImage(
    personId: number,
  ): Promise<PersonImageResult | undefined> {
    const results = await this.#get<TmdbPersonImagesResult>(
      `/person/${personId}/images`,
    )

    const result = [...(results?.profiles ?? [])]
      .sort(
        (a, b) =>
          b.vote_average - a.vote_average ||
          b.vote_count - a.vote_count ||
          b.width - a.width,
      )
      .at(0)

    if (result) {
      return {
        url: constructURL(profileSizes.medium, result.file_path),
        personId,
      }
    }
  }

  async searchMovies(
    title: string,
    year?: string,
  ): Promise<MovieSearchResult[] | undefined> {
    const params: Record<string, string> = { query: title }
    if (year != null) params.year = year

    const resp = await this.#get<SearchResponse<TmdbMovieSearchResult>>(
      '/search/movie',
      params,
    )

    return resp?.results.map((result) => ({
      tmdbId: result.id,
      title: result.title,
      poster: constructURL(posterSizes.medium, result.poster_path),
      releaseDate: result.release_date,
    }))
  }

  async searchTv(title: string): Promise<TvSearchResult[] | undefined> {
    const resp = await this.#get<SearchResponse<TmdbTvSearchResult>>(
      '/search/tv',
      { query: title },
    )

    return resp?.results.map((result) => ({
      tmdbId: result.id,
      title: result.name,
      poster: constructURL(posterSizes.medium, result.poster_path),
      firstAirDate: result.first_air_date,
      overview: result.overview,
    }))
  }

  async findByImdbId(
    imdbId: string,
  ): Promise<{ id: number; type: 'movie' | 'series' } | undefined> {
    const response = await this.#get<FindResponse>(`/find/${imdbId}`, {
      external_source: 'imdb_id',
    })
    const movie = response?.movie_results[0]
    if (movie) return { id: movie.id, type: 'movie' }
    const series = response?.tv_results[0]
    if (series) return { id: series.id, type: 'series' }
  }

  async fetchMovieMetadata(
    title: string,
    year?: number,
    lang?: string,
  ): Promise<Metadata | undefined> {
    const search = await this.searchMovies(title, String(year))
    const first = search?.[0]
    if (!first) return

    return this.fetchMovieMetadataById(first.tmdbId, lang)
  }

  async fetchMovieMetadataById(
    movieId: number,
    lang?: string,
  ): Promise<Metadata | undefined> {
    const details = await this.#get<TmdbMovieDetailsResult>(
      `/movie/${movieId}`,
      {
        append_to_response: 'credits',
      },
    )

    if (!details) return

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

    data.images ??= {}
    const language = lang || 'en'
    const images = await this.fetchMovieImages(movieId, language)

    if (images?.backdrops) {
      data.images.backdrop = images.backdrops
        .slice(0, 5)
        .map((i) => constructURL(backdropSizes.large, i.file_path))
    }

    const poster = pickByLanguage(images?.posters ?? [], language)
    if (poster) {
      data.images.poster = [
        { src: constructURL(posterSizes.xlarge, poster.file_path) },
      ]
    } else if (details.poster_path) {
      data.images.poster = [
        { src: constructURL(posterSizes.xlarge, details.poster_path) },
      ]
    }

    const logo = pickByLanguage(images?.logos ?? [], language)
    if (logo) {
      data.images.logo = constructURL(logoSizes.original, logo.file_path)
    }

    return data
  }

  async fetchTvMetadata(
    seriesTitle: string,
    season?: number,
    episode?: number,
  ): Promise<Metadata | undefined> {
    const search = await this.searchTv(seriesTitle)
    const first = search?.[0]
    if (!first) return

    return this.fetchTvMetadataById(first.tmdbId, season, episode)
  }

  async fetchTvMetadataById(
    seriesId: number,
    season?: number,
    episode?: number,
  ): Promise<Metadata | undefined> {
    const details = await this.#get<TmdbTvDetailsResult>(`/tv/${seriesId}`, {
      append_to_response: 'credits,external_ids',
    })
    if (!details) return

    const episodeDetails =
      season != null && episode != null
        ? await this.#get<TmdbEpisodeResult>(
            `/tv/${seriesId}/season/${season}/episode/${episode}`,
          )
        : null

    const cast = details.credits?.cast ?? []
    const crew = details.credits?.crew ?? []

    const metadata: Metadata = {
      tmdbId: seriesId,
      seriesId,
      ...(details.external_ids?.imdb_id && {
        imdbId: details.external_ids.imdb_id,
      }),
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
    }

    if (season != null) metadata.seasonNumber = season
    if (episode != null) metadata.episodeNumber = episode

    if (details.poster_path) {
      metadata.images ??= {}
      metadata.images.poster = [
        { src: constructURL(posterSizes.xlarge, details.poster_path) },
      ]
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

  async fetchMovieImages(movieId: number, lang = 'en') {
    return this.#get<TmdbMovieImagesResult>(`/movie/${movieId}/images`, {
      include_image_language: `${lang},null`,
    })
  }

  clearCache(): void {
    this.#cache.clear()
  }
}

function constructURL(size: string, imagePath?: string | null | undefined) {
  if (!imagePath) return ''

  return new URL(`${size}${imagePath}`, secureBaseURL).href
}

/**
 * Pick the single best image for a language: exact language match first,
 * then language-neutral, then anything, ranked by TMDb votes within each
 * group.
 */
function pickByLanguage(
  images: ImageResult[],
  lang: string,
): ImageResult | undefined {
  const matches = images.filter((i) => i.iso_639_1 === lang)
  const neutral = images.filter((i) => i.iso_639_1 === null)
  const candidates = matches.length
    ? matches
    : neutral.length
      ? neutral
      : images

  return [...candidates].sort(
    (a, b) =>
      b.vote_average - a.vote_average ||
      b.vote_count - a.vote_count ||
      b.width - a.width,
  )[0]
}
