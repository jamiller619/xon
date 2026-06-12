import { mkdir } from 'node:fs/promises'
import path, { join } from 'node:path'
import sharp from 'sharp'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { convertRawToJpeg, isRawImage } from './raw.ts'

const logger = createLogger('thumbnails')

export type ThumbnailPaths = {
  small: string
  medium: string
  large: string
}

const THUMBNAIL_SIZES = {
  small: 150,
  medium: 300,
  large: 600,
} as const

export async function generateThumbnails(
  filePath: string,
  mediaItemId: string,
): Promise<ThumbnailPaths | undefined> {
  logger.debug(`Generating thumbnails: ${filePath}`)

  try {
    return writeThumbnailImages(mediaItemId, filePath)
  } catch (err) {
    logger.error('Thumbnail generation failed', {
      filePath,
      error: String(err),
    })
  }
}

export async function writeThumbnailImages(
  thumbnailFileName: string,
  mediaFilePath: string,
): Promise<ThumbnailPaths | undefined> {
  const thumbnailDir = path.join(config.get('appdata.cachePath'), 'thumbnails')

  try {
    await mkdir(thumbnailDir, { recursive: true })
  } catch {
    logger.error('Failed to create thumbnails directory', { thumbnailDir })
    return
  }

  const paths: ThumbnailPaths = {
    small: join(thumbnailDir, `${thumbnailFileName}_small.jpg`),
    medium: join(thumbnailDir, `${thumbnailFileName}_medium.jpg`),
    large: join(thumbnailDir, `${thumbnailFileName}_large.jpg`),
  }

  try {
    let img: ReturnType<typeof sharp>

    if (isRawImage(mediaFilePath)) {
      logger.debug(`Converting RAW image: ${mediaFilePath}`)
      const rawBuffer = await convertRawToJpeg(mediaFilePath)
      img = sharp(rawBuffer)
    } else {
      img = sharp(mediaFilePath)
    }

    await Promise.all([
      img
        .clone()
        .resize(THUMBNAIL_SIZES.small, THUMBNAIL_SIZES.small, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.small),
      img
        .clone()
        .resize(THUMBNAIL_SIZES.medium, THUMBNAIL_SIZES.medium, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.medium),
      img
        .clone()
        .resize(THUMBNAIL_SIZES.large, THUMBNAIL_SIZES.large, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.large),
    ])
  } catch (err) {
    logger.error('Thumbnail resize failed', {
      filePath: thumbnailFileName,
      error: String(err),
    })

    return undefined
  }

  return paths
}
