import { spawn } from 'node:child_process'
import { createLogger } from '../logger.ts'
import { ffprobePath } from './binaries.ts'

const logger = createLogger('ffprobe')

// const VIDEO_CATEGORIES = new Set<string>([
//   MediaCategory.Movies,
//   MediaCategory.TVShows,
//   // MediaCategory.Clips,
//   MediaCategory.HomeVideos,
// ])

// const AUDIO_CATEGORIES = new Set<string>([
//   MediaCategory.Music,
//   // MediaCategory.Audiobooks,
//   // MediaCategory.AudioClips,
//   // MediaCategory.Podcasts,
// ])

export type FfprobeMetadata = {
  duration?: number
  bitrate?: number
  codec?: string
  audioCodec?: string
  resolution?: { width: number; height: number }
  sampleRate?: number
  channels?: number
}

export type StreamTrack = {
  index: number
  codecType: 'audio' | 'subtitle'
  codec: string
  language?: string
  title?: string
}

// export function isAudioVideoCategory(mediaType: string | null): boolean {
//   if (!mediaType) return false

//   return mediaType.startsWith('video/') || mediaType.startsWith('audio/')
// }

export async function extractStreamTracks(
  filePath: string,
): Promise<StreamTrack[]> {
  return new Promise((resolve) => {
    let stdout = ''

    const proc = spawn(ffprobePath, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      filePath,
    ])

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('error', () => {
      resolve([])
    })

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        resolve([])
        return
      }

      try {
        const data = JSON.parse(stdout) as {
          streams?: Record<string, unknown>[]
        }
        const tracks: StreamTrack[] = []

        for (const stream of data.streams ?? []) {
          const codecType = stream.codec_type as string | undefined
          if (codecType !== 'audio' && codecType !== 'subtitle') continue

          const index = Number(stream.index)
          const codec =
            typeof stream.codec_name === 'string'
              ? stream.codec_name
              : 'unknown'
          const tags = stream.tags as Record<string, string> | undefined
          const language = tags?.language
          const title = tags?.title

          tracks.push({
            index,
            codecType,
            codec,
            ...(language ? { language } : {}),
            ...(title ? { title } : {}),
          })
        }

        resolve(tracks)
      } catch {
        resolve([])
      }
    })
  })
}

export async function extractFfprobeMetadata(
  filePath: string,
): Promise<FfprobeMetadata | null> {
  logger.debug(`Extracting metadata: ${filePath}`)

  return new Promise((resolve) => {
    let stdout = ''

    const proc = spawn(ffprobePath, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filePath,
    ])

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('error', (err: Error) => {
      logger.error(`FFprobe not available: ${err.message}`)
      resolve(null)
    })

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        logger.error(`FFprobe exited with code ${String(code)}`, { filePath })
        resolve(null)
        return
      }

      try {
        const data = JSON.parse(stdout) as {
          format?: Record<string, unknown>
          streams?: Record<string, unknown>[]
        }
        const result: FfprobeMetadata = {}

        const format = data.format
        if (format) {
          const dur = Number(format.duration)
          if (!Number.isNaN(dur) && dur > 0) result.duration = dur
          const br = Number(format.bit_rate)
          if (!Number.isNaN(br) && br > 0) result.bitrate = br
        }

        for (const stream of data.streams ?? []) {
          const codecType = stream.codec_type as string | undefined
          if (codecType === 'video' && result.codec === undefined) {
            const codecName = stream.codec_name
            if (typeof codecName === 'string') result.codec = codecName
            const w = Number(stream.width)
            const h = Number(stream.height)
            if (w > 0 && h > 0) {
              result.resolution = { width: w, height: h }
            }
          } else if (codecType === 'audio' && result.audioCodec === undefined) {
            const audioCodecName = stream.codec_name
            if (typeof audioCodecName === 'string')
              result.audioCodec = audioCodecName
            const sr = Number(stream.sample_rate)
            if (sr > 0) result.sampleRate = sr
            const ch = Number(stream.channels)
            if (ch > 0) result.channels = ch
          }
        }

        logger.debug(`Metadata extracted: ${filePath}`, {
          duration: result.duration,
          codec: result.codec,
          audioCodec: result.audioCodec,
          resolution: result.resolution,
        })

        resolve(result)
      } catch {
        logger.error('FFprobe JSON parse error', { filePath })
        resolve(null)
      }
    })
  })
}
