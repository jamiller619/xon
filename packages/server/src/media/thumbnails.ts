import { createLogger } from '../logger.js'
import { type ThumbnailPaths, writeThumbnailImages } from './images.js'

const logger = createLogger('thumbnails')

export async function generateThumbnails(
  filePath: string,
  mediaItemId: string,
  dataDir: string,
): Promise<ThumbnailPaths | undefined> {
  logger.debug(`Generating thumbnails: ${filePath}`)

  try {
    return writeThumbnailImages(mediaItemId, dataDir, logger)
  } catch (err) {
    logger.error('Thumbnail generation failed', {
      filePath,
      error: String(err),
    })
  }
}
