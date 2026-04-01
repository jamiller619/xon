import { extname } from 'node:path'
import type { MediaCategory } from '@xon/shared'
import { EXTENSION_TO_CATEGORY } from './categories.js'

export * from './categories.js'

/**
 * Returns the primary media category for the given file path based on its extension.
 * Returns undefined if the extension is not recognized.
 */
export function getMediaCategory(filePath: string): MediaCategory | undefined {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_TO_CATEGORY[ext]
}
