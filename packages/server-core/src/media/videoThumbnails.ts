import { spawn } from 'node:child_process'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { MediaCategory } from '@xon/shared'
import sharp from 'sharp'
import type { ThumbnailPaths } from './thumbnails.js'

const VIDEO_CATEGORIES = new Set<string>([
  MediaCategory.Movies,
  MediaCategory.TVShows,
  MediaCategory.Clips,
  MediaCategory.HomeVideos,
])

const THUMBNAIL_SIZES = {
  small: 150,
  medium: 300,
  large: 600,
} as const

export function isVideoCategory(category: string | null): boolean {
  if (!category) return false
  return VIDEO_CATEGORIES.has(category)
}

function getVideoDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    let stdout = ''
    const proc = spawn('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      filePath,
    ])

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('error', () => resolve(null))

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      try {
        const data = JSON.parse(stdout) as { format?: { duration?: string } }
        const dur = Number(data.format?.duration)
        resolve(!Number.isNaN(dur) && dur > 0 ? dur : null)
      } catch {
        resolve(null)
      }
    })
  })
}

function extractFrame(
  filePath: string,
  timestamp: number,
  outputPath: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-ss',
      String(timestamp),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-y',
      outputPath,
    ])

    proc.on('error', () => resolve(false))
    proc.on('close', (code: number | null) => resolve(code === 0))
  })
}

export async function generateVideoThumbnails(
  filePath: string,
  mediaItemId: string,
  dataDir: string,
): Promise<ThumbnailPaths | null> {
  const thumbnailDir = join(dataDir, 'thumbnails')
  try {
    await mkdir(thumbnailDir, { recursive: true })
  } catch {
    console.error(`Failed to create thumbnails directory: ${thumbnailDir}`)
    return null
  }

  const duration = await getVideoDuration(filePath)
  const timestamp = duration !== null ? duration * 0.1 : 0

  const tmpPath = join(thumbnailDir, `${mediaItemId}_tmp.jpg`)
  const frameExtracted = await extractFrame(filePath, timestamp, tmpPath)
  if (!frameExtracted) {
    console.error(`FFmpeg frame extraction failed for ${filePath}`)
    return null
  }

  const paths: ThumbnailPaths = {
    small: join(thumbnailDir, `${mediaItemId}_small.jpg`),
    medium: join(thumbnailDir, `${mediaItemId}_medium.jpg`),
    large: join(thumbnailDir, `${mediaItemId}_large.jpg`),
  }

  try {
    const img = sharp(tmpPath)
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
    console.error(
      `Video thumbnail resize failed for ${filePath}: ${String(err)}`,
    )
    try {
      await unlink(tmpPath)
    } catch {}
    return null
  }

  try {
    await unlink(tmpPath)
  } catch {}

  return paths
}
