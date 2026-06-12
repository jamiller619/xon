import { spawn } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
// import { MediaCategory } from '@xon/shared'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { ffmpegPath, ffprobePath } from './binaries.ts'
import { type ThumbnailPaths, writeThumbnailImages } from './thumbnails.ts'

const logger = createLogger('video-thumbnails')

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
