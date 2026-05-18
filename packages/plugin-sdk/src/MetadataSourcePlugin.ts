import type { MediaCategory, MediaItem, Metadata } from '@xon/shared'
import { BasePlugin } from './BasePlugin.js'

/**
 * Abstract base class for plugins that match media titles against an external source.
 * Implement this to integrate with services like TMDB, MusicBrainz, etc.
 */
export abstract class MetadataSourcePlugin extends BasePlugin {
  /**
   * Media categories this plugin can match.
   * Only items whose mediaCategory is in this list will be sent to match().
   */
  // abstract readonly supportedCategories: MediaCategory[]

  /**
   * Attempt to find a match for the given media item.
   * @param fileName - Filename without extension (e.g. "Almost Famous EXTENDED 2000")
   * @param mediaCategory - The media category of the item
   * @returns The best match found, or null if no confident match
   */
  // abstract match(
  //   fileName: string,
  //   mediaCategory: MediaCategory,
  // ): Promise<MatchResult | null>

  /**
   * Enrich the metadata of a media item.
   * @param mediaItem - The media item to enrich
   * @returns The enriched metadata
   */
  abstract enrich(
    filePath: string,
    category: MediaCategory,
  ): Promise<Metadata | undefined | null>
}
