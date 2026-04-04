import { spawn } from 'node:child_process'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { MediaCategory } from '@xon/shared'
import sharp from 'sharp'
import { createLogger } from '../logger.js'
import { ffmpegPath, ffprobePath } from './binaries.js'
import type { ThumbnailPaths } from './thumbnails.js'

const logger = createLogger('video-thumbnails')

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
    const proc = spawn(ffprobePath, [
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
    // Drain stderr to prevent the pipe buffer from filling and hanging the process
    proc.stderr?.resume()

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
    const proc = spawn(ffmpegPath, [
      '-nostdin',
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

    // Drain stdout and capture stderr so the pipe buffer never fills and hangs the process
    proc.stdout?.resume()
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      logger.error(`FFmpeg spawn error`, { ffmpegPath, error: err.message })
      resolve(false)
    })
    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        logger.error(`FFmpeg frame extraction failed`, {
          filePath,
          exitCode: code,
          stderr: stderr.slice(-500),
        })
      }
      resolve(code === 0)
    })
  })
}

export async function generateVideoThumbnails(
  filePath: string,
  mediaItemId: string,
  dataDir: string,
): Promise<ThumbnailPaths | null> {
  logger.debug(`Generating thumbnails: ${filePath}`)

  const thumbnailDir = join(dataDir, 'thumbnails')
  try {
    await mkdir(thumbnailDir, { recursive: true })
  } catch {
    logger.error(`Failed to create thumbnails directory`, { thumbnailDir })
    return null
  }

  const duration = await getVideoDuration(filePath)
  if (duration === null) {
    logger.debug(`Could not determine video duration: ${filePath}`)
  }
  const timestamp = duration !== null ? duration * 0.1 : 0
  logger.debug(`Extracting frame at ${timestamp.toFixed(1)}s: ${filePath}`)

  const tmpPath = join(thumbnailDir, `${mediaItemId}_tmp.jpg`)
  const frameExtracted = await extractFrame(filePath, timestamp, tmpPath)
  if (!frameExtracted) {
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
    logger.error(`Thumbnail resize failed`, { filePath, error: String(err) })
    try {
      await unlink(tmpPath)
    } catch {}
    return null
  }

  try {
    await unlink(tmpPath)
  } catch {}

  logger.debug(`Thumbnails generated: ${filePath}`)
  return paths
}
