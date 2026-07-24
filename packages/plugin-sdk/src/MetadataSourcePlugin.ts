import type { LibraryType, MediaType, Metadata, PosterImage } from '@xon/shared'
import { BasePlugin } from './BasePlugin.js'

export interface EnrichOptions {
  /** Preferred language for localized fields (e.g. images) */
  lang?: string
  /** Title parsed from the filename by the core title stage */
  title?: string | undefined
  /**
   * Filename-derived details from the core title stage (year,
   * seasons, episodeNumbers, resolution, …)
   */
  fileMetadata?: Metadata | undefined
  /**
   * Metadata accumulated from previously-run metadata sources.
   * Lets a plugin match by an external id (e.g. `imdbId` from TMDb)
   * instead of re-parsing the file path.
   */
  metadata?: Metadata | undefined
}

export interface MetadataSearchQuery {
  title: string
  year?: number | undefined
  libraryType: LibraryType
  mediaType: MediaType.MainType
  limit: number
  /** File-derived values such as season and episode numbers. */
  fileMetadata?: Metadata | undefined
}

export interface MetadataSearchResult {
  id: string
  title: string
  year?: number | undefined
  releaseDate?: string | undefined
  posterUrl?: string | undefined
  mediaKind?: 'movie' | 'series' | undefined
  description?: string | undefined
}

export interface MetadataSearchAvailability {
  available: boolean
  reason?: string | undefined
}

/**
 * Abstract base class for plugins that match media titles against an external source.
 * Implement this to integrate with services like TMDB, MusicBrainz, etc.
 */
export abstract class MetadataSourcePlugin extends BasePlugin {
  abstract readonly mediaTypes: MediaType.MainType[]

  /**
   * All metadata plugins are expected to implement interactive matching.
   * The default keeps older plugins loadable while clearly reporting that
   * they have not migrated to the search contract yet.
   */
  getSearchAvailability(): MetadataSearchAvailability {
    return {
      available: false,
      reason: 'Interactive search is not implemented by this plugin',
    }
  }

  async search(_query: MetadataSearchQuery): Promise<MetadataSearchResult[]> {
    return []
  }

  async resolveMatch(
    _id: string,
    _query: MetadataSearchQuery,
  ): Promise<Metadata | undefined> {
    return undefined
  }

  /**
   * Fetch every poster available for an already-matched title.
   * Providers that do not support artwork discovery return an empty list.
   */
  async findPosters(
    _id: string,
    _query: MetadataSearchQuery,
  ): Promise<Array<string | PosterImage>> {
    return []
  }

  /**
   * Enrich the metadata of a media item.
   * @returns The enriched metadata
   */
  abstract enrich(
    filePath: string,
    libraryType: LibraryType,
    options?: EnrichOptions,
  ): Promise<Metadata | undefined | null>
}
