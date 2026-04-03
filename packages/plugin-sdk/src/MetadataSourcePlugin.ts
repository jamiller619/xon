import type { MediaCategory } from '@xon/shared'
import { BasePlugin } from './BasePlugin.js'
import type { MatchResult } from './types.js'

/**
 * Abstract base class for plugins that match media titles against an external source.
 * Implement this to integrate with services like TMDB, MusicBrainz, etc.
 */
export abstract class MetadataSourcePlugin extends BasePlugin {
  /**
   * Media categories this plugin can match.
   * Only items whose mediaCategory is in this list will be sent to match().
   */
  abstract readonly supportedCategories: MediaCategory[]

  /**
   * Attempt to find a match for the given media item.
   * @param fileName - Filename without extension (e.g. "Almost Famous EXTENDED 2000")
   * @param mediaCategory - The media category of the item
   * @returns The best match found, or null if no confident match
   */
  abstract match(
    fileName: string,
    mediaCategory: MediaCategory,
  ): Promise<MatchResult | null>
}
