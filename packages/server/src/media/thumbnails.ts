import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { type ThumbnailPaths, writeThumbnailImages } from './images.ts'

const dataDir = config.get('appdata.cachePath')
const logger = createLogger('thumbnails')

export async function generateThumbnails(
  filePath: string,
  mediaItemId: string,
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
