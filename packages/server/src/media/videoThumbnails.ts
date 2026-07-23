import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PosterImage } from '@xon/shared'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { ffmpegPath, ffprobePath } from './binaries.ts'
import { type ThumbnailPaths, writeThumbnailImages } from './thumbnails.ts'

const logger = createLogger('video-thumbnails')
const GENERATED_IMAGE_COUNT = 3
const RANDOM_FRAME_START = 0.05
const RANDOM_FRAME_RANGE = 0.9
const BACKDROP_WIDTH = 1280
const BACKDROP_HEIGHT = 720

// const VIDEO_CATEGORIES = new Set<string>([
//   MediaCategory.Movies,
//   MediaCategory.TVShows,
//   // MediaCategory.Clips,
//   MediaCategory.HomeVideos,
// ])

// export function isVideoCategory(category: string | null): boolean {
//   if (!category) return false
//   return VIDEO_CATEGORIES.has(category)
// }

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
  videoFilter?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      '-nostdin',
      '-ss',
      String(timestamp),
      '-i',
      filePath,
      '-frames:v',
      '1',
      ...(videoFilter ? ['-vf', videoFilter] : []),
      '-q:v',
      '2',
      '-y',
      outputPath,
    ]
    const proc = spawn(ffmpegPath, args)

    // Drain stdout and capture stderr so the pipe buffer never fills and hangs the process
    proc.stdout?.resume()
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      logger.error('FFmpeg spawn error', { ffmpegPath, error: err.message })
      resolve(false)
    })
    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        logger.error('FFmpeg frame extraction failed', {
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
): Promise<ThumbnailPaths | undefined> {
  logger.debug(`Generating thumbnails: ${filePath}`)

  const duration = await getVideoDuration(filePath)
  if (duration === null) {
    logger.debug(`Could not determine video duration: ${filePath}`)
  }
  const timestamp = duration !== null ? duration * 0.1 : 0
  logger.debug(`Extracting frame at ${timestamp.toFixed(1)}s: ${filePath}`)

  const tmpPath = join(
    config.get('appdata.path'),
    '.tmp',
    `${mediaItemId}_tmp.jpg`,
  )

  // FFmpeg's image2 muxer won't create missing parent directories; without
  // this the write fails with "Error muxing a packet" (I/O error).
  try {
    await mkdir(dirname(tmpPath), { recursive: true })
  } catch (err) {
    logger.error('Failed to create thumbnail temp directory', {
      dir: dirname(tmpPath),
      error: String(err),
    })
    return undefined
  }

  const frameExtracted = await extractFrame(filePath, timestamp, tmpPath)
  if (!frameExtracted) {
    return undefined
  }

  const paths = await writeThumbnailImages(mediaItemId, tmpPath)

  try {
    await unlink(tmpPath)
  } catch {}

  logger.debug(`Thumbnails generated: ${filePath}`)

  return paths
}

/**
 * Extract three frames from random points in a video and turn each frame into
 * a poster with its own thumbnail set.
 */
export async function generateVideoPosters(
  filePath: string,
  mediaItemId: string,
): Promise<PosterImage[] | undefined> {
  logger.debug(`Generating video posters: ${filePath}`)

  const duration = await getVideoDuration(filePath)
  if (duration === null) {
    logger.error('Could not determine video duration for poster generation', {
      filePath,
    })
    return undefined
  }

  const posters: PosterImage[] = []

  for (let index = 0; index < GENERATED_IMAGE_COUNT; index++) {
    // Avoid credits and black leader frames by sampling within the middle 90%.
    const timestamp =
      duration * (RANDOM_FRAME_START + Math.random() * RANDOM_FRAME_RANGE)
    const thumbnailName = `${mediaItemId}_poster_${randomUUID()}`
    const tmpPath = join(
      config.get('appdata.path'),
      '.tmp',
      `${thumbnailName}.jpg`,
    )

    try {
      await mkdir(dirname(tmpPath), { recursive: true })
    } catch (err) {
      logger.error('Failed to create video poster temp directory', {
        dir: dirname(tmpPath),
        error: String(err),
      })
      await removeGeneratedPosters(posters)
      return undefined
    }

    logger.debug(
      `Extracting poster frame ${index + 1} at ${timestamp.toFixed(1)}s: ${filePath}`,
    )
    const frameExtracted = await extractFrame(filePath, timestamp, tmpPath)
    if (!frameExtracted) {
      await unlink(tmpPath).catch(() => undefined)
      await removeGeneratedPosters(posters)
      return undefined
    }

    const thumbnails = await writeThumbnailImages(thumbnailName, tmpPath)
    await unlink(tmpPath).catch(() => undefined)
    if (!thumbnails) {
      await removeGeneratedPosters(posters)
      return undefined
    }

    posters.push({
      src: thumbnails.large,
      thumbnails,
    })
  }

  logger.debug(`Generated ${posters.length} video posters: ${filePath}`)
  return posters
}

/**
 * Extract three frames from random points in a video as 16:9 backdrop JPEGs.
 * Frames are scaled and center-cropped so portrait and ultrawide videos still
 * produce consistent backdrop artwork.
 */
export async function generateVideoBackdrops(
  filePath: string,
  mediaItemId: string,
): Promise<string[] | undefined> {
  logger.debug(`Generating video backdrops: ${filePath}`)

  const duration = await getVideoDuration(filePath)
  if (duration === null) {
    logger.error('Could not determine video duration for backdrop generation', {
      filePath,
    })
    return undefined
  }

  const directory = join(
    config.get('appdata.cachePath'),
    'media-images',
    mediaItemId,
  )
  try {
    await mkdir(directory, { recursive: true })
  } catch (err) {
    logger.error('Failed to create video backdrop directory', {
      dir: directory,
      error: String(err),
    })
    return undefined
  }

  const backdrops: string[] = []
  const videoFilter =
    `scale=${BACKDROP_WIDTH}:${BACKDROP_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${BACKDROP_WIDTH}:${BACKDROP_HEIGHT}`

  for (let index = 0; index < GENERATED_IMAGE_COUNT; index++) {
    const timestamp =
      duration * (RANDOM_FRAME_START + Math.random() * RANDOM_FRAME_RANGE)
    const outputPath = join(directory, `backdrop_${randomUUID()}.jpg`)

    logger.debug(
      `Extracting backdrop frame ${index + 1} at ${timestamp.toFixed(1)}s: ${filePath}`,
    )
    const frameExtracted = await extractFrame(
      filePath,
      timestamp,
      outputPath,
      videoFilter,
    )
    if (!frameExtracted) {
      await unlink(outputPath).catch(() => undefined)
      await removeGeneratedFiles(backdrops)
      return undefined
    }
    backdrops.push(outputPath)
  }

  logger.debug(`Generated ${backdrops.length} video backdrops: ${filePath}`)
  return backdrops
}

async function removeGeneratedPosters(posters: PosterImage[]): Promise<void> {
  await Promise.all(
    posters.flatMap((poster) =>
      Object.values(poster.thumbnails ?? {}).map((path) =>
        unlink(path).catch(() => undefined),
      ),
    ),
  )
}

async function removeGeneratedFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => unlink(path).catch(() => undefined)))
}
