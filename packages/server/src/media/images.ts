import { mkdir } from 'node:fs/promises'
import path, { extname, join } from 'node:path'
import sharp from 'sharp'
import config from '../config.ts'
import type { Logger } from '../logger.js'
import { convertRawToJpeg } from './raw.js'

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

export async function writeThumbnailImages(
  thumbnailFileName: string,
  sharpInput: string,
  logger: Logger,
): Promise<ThumbnailPaths | undefined> {
  const dataDir = path.join(config.get('appdata.cachePath'), 'thumbnails')
  // const dataDir = process.env.DATA_DIR

  if (!dataDir) {
    throw new Error('DATA_DIR environment variable not set')
  }

  const thumbnailDir = join(dataDir, 'thumbnails')
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

    if (isRawImage(sharpInput)) {
      logger.debug(`Converting RAW image: ${sharpInput}`)
      const rawBuffer = await convertRawToJpeg(sharpInput)
      img = sharp(rawBuffer)
    } else {
      img = sharp(sharpInput)
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

export const RAW_EXTENSIONS = new Set([
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.dng',
  '.orf',
  '.raf',
])

export function isRawImage(filePath: string): boolean {
  return RAW_EXTENSIONS.has(extname(filePath).toLowerCase())
}
