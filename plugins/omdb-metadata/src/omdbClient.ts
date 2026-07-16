import type { Metadata } from '@xon/shared'

const TMDB_BASE = 'https://www.omdbapi.com/'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface OmdbRating {
  Source: string
  Value: string
}

export interface OmdbMovieMetadata {
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
  Ratings: OmdbRating[]
  Metascore: string
  imdbRating: string
  imdbVotes: string
  imdbID: string
  Type: string
  DVD: string
  BoxOffice: string
  Production: string
  Website: string
  Response: string
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

interface TmdbPersonImagesResult {
  profiles: ImageResult[]
}

export interface ImageResult {
  aspect_ratio: number
  file_path: string
  height: number
  iso_639_1: string
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

  async fetchMovieMetadata(
    title: string,
    year?: number,
    lang?: string,
  ): Promise<Metadata | undefined> {
    const search = await this.searchMovies(title, String(year))
    const first = search?.[0]
    if (!first) return

    const details = await this.#get<TmdbMovieDetailsResult>(
      `/movie/${first.tmdbId}`,
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
    const images = await this.fetchMovieImages(first.tmdbId, lang)

    if (images?.backdrops) {
      data.images.backdrop = images.backdrops
        .slice(0, 5)
        .map((i) => constructURL(backdropSizes.large, i.file_path))
    }

    if (images?.posters) {
      data.images.poster = images.posters
        .slice(0, 5)
        .map((i) => constructURL(posterSizes.xlarge, i.file_path))
    }

    if (images?.logos) {
      const logo = images.logos.at(0)

      if (logo) {
        data.images.logo = constructURL(logoSizes.original, logo.file_path)
      }
    }

    return data
  }

  async fetchTvMetadata(
    seriesTitle: string,
    season: number,
    episode: number,
  ): Promise<Metadata | undefined> {
    const search = await this.#get<SearchResponse<TmdbTvSearchResult>>(
      '/search/tv',
      {
        query: seriesTitle,
      },
    )
    const first = search?.results[0]
    if (!first) return

    const details = await this.#get<TmdbTvDetailsResult>(`/tv/${first.id}`, {
      append_to_response: 'credits',
    })
    if (!details) return

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

  async fetchMovieImages(movieId: number, lang?: string) {
    const url = `/movie/${movieId}/images${lang ? `?language=${lang}` : ''}`

    const images = await this.#get<TmdbMovieImagesResult>(url)

    return images
  }

  clearCache(): void {
    this.#cache.clear()
  }
}

function constructURL(size: string, imagePath?: string | null | undefined) {
  if (!imagePath) return ''

  return new URL(`${size}${imagePath}`, secureBaseURL).href
}
