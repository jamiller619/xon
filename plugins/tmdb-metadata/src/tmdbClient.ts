const TMDB_BASE = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

export interface TmdbMovieMetadata {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: number;
  genres: string[];
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbTvMetadata {
  tmdbId: number;
  seriesId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string;
  voteAverage: number;
  genres: string[];
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
  episodeOverview?: string;
  episodeStillPath?: string;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// Internal TMDb API response shapes
interface TmdbMovieSearchResult {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
}

interface TmdbMovieDetailsResult extends TmdbMovieSearchResult {
  overview: string;
  genres: Array<{ id: number; name: string }>;
  credits: {
    cast: Array<{ id: number; name: string; character: string; order: number }>;
    crew: Array<{ id: number; name: string; job: string; department: string }>;
  };
}

interface TmdbTvSearchResult {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
}

interface TmdbTvDetailsResult extends TmdbTvSearchResult {
  genres: Array<{ id: number; name: string }>;
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number }>;
    crew: Array<{ id: number; name: string; job: string; department: string }>;
  };
}

interface TmdbEpisodeResult {
  id: number;
  name: string;
  overview: string;
  still_path: string | null;
  season_number: number;
  episode_number: number;
}

interface SearchResponse<T> {
  results: T[];
}

const KEY_JOBS = new Set([
  'Director',
  'Producer',
  'Writer',
  'Executive Producer',
  'Creator',
]);

export class TmdbClient {
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(apiKey: string, fetchFn: FetchFn) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  private async get<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T | null> {
    const cacheKey = `${path}|${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await this.fetchFn(url.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as T;
    this.cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  async fetchMovieMetadata(
    title: string,
    year?: number,
  ): Promise<TmdbMovieMetadata | null> {
    const params: Record<string, string> = { query: title };
    if (year !== undefined) params.year = String(year);

    const search = await this.get<SearchResponse<TmdbMovieSearchResult>>(
      '/search/movie',
      params,
    );
    const first = search?.results[0];
    if (!first) return null;

    const details = await this.get<TmdbMovieDetailsResult>(
      `/movie/${first.id}`,
      {
        append_to_response: 'credits',
      },
    );
    if (!details) return null;

    return {
      tmdbId: details.id,
      title: details.title,
      originalTitle: details.original_title,
      overview: details.overview,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
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
    };
  }

  async fetchTvMetadata(
    seriesTitle: string,
    season: number,
    episode: number,
  ): Promise<TmdbTvMetadata | null> {
    const search = await this.get<SearchResponse<TmdbTvSearchResult>>(
      '/search/tv',
      {
        query: seriesTitle,
      },
    );
    const first = search?.results[0];
    if (!first) return null;

    const details = await this.get<TmdbTvDetailsResult>(`/tv/${first.id}`, {
      append_to_response: 'credits',
    });
    if (!details) return null;

    const episodeDetails = await this.get<TmdbEpisodeResult>(
      `/tv/${first.id}/season/${season}/episode/${episode}`,
    );

    const cast = details.credits?.cast ?? [];
    const crew = details.credits?.crew ?? [];

    const metadata: TmdbTvMetadata = {
      tmdbId: first.id,
      seriesId: first.id,
      title: details.name,
      originalTitle: details.original_name,
      overview: details.overview,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
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
    };

    if (episodeDetails) {
      metadata.episodeTitle = episodeDetails.name;
      metadata.episodeOverview = episodeDetails.overview;
      if (episodeDetails.still_path !== null) {
        metadata.episodeStillPath = episodeDetails.still_path;
      }
    }

    return metadata;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
