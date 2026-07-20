import type { LibraryType, MediaType, Metadata } from '@xon/shared'
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

/**
 * Abstract base class for plugins that match media titles against an external source.
 * Implement this to integrate with services like TMDB, MusicBrainz, etc.
 */
export abstract class MetadataSourcePlugin extends BasePlugin {
  abstract readonly mediaTypes: MediaType.MainType[]

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
