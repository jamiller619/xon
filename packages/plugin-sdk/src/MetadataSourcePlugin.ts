import type { LibraryType, MediaType, Metadata } from '@xon/shared'
import { BasePlugin } from './BasePlugin.js'

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
    lang?: string,
  ): Promise<Metadata | undefined | null>
}
