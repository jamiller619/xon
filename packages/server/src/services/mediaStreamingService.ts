import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { parsePlaybackClient } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mediaItems } from '../db/schema.ts'
import { extractStreamTracks } from '../media/ffprobe.ts'
import { resolveMediaItemFilePath } from '../media/mediaFilePaths.ts'
import { convertRawToJpeg, isRawImage } from '../media/raw.ts'
import {
  generateHlsPlaylist,
  needsTranscoding,
  spawnTranscodeSegment,
} from '../media/transcode.ts'

const HLS_SEGMENT_DURATION = 6
const HLS_SEGMENT_VERSION = '2'

export type StreamDecision =
  | { status: 'media-not-found' }
  | { status: 'raw-error'; message: string }
  | { status: 'raw'; data: Buffer }
  | { status: 'hls' }
  | {
      status: 'direct'
      item: typeof mediaItems.$inferSelect
      sourcePath: string
    }

export type HlsPlaylistResult =
  | { status: 'media-not-found' }
  | { status: 'duration-unavailable' }
  | { status: 'ok'; playlist: string }

export type HlsSegmentResult =
  | { status: 'media-not-found' }
  | { status: 'ok'; process: ReturnType<typeof spawnTranscodeSegment> }

export interface MediaTracks {
  audioTracks: {
    index: number
    codec: string
    language?: string | undefined
    title?: string | undefined
  }[]
  subtitleTracks: (
    | {
        type: 'embedded'
        index: number
        codec: string
        language?: string | undefined
        title?: string | undefined
        label: string
      }
    | {
        type: 'external'
        file: string
        language?: string | undefined
        label: string
      }
  )[]
}

export type SubtitleResult =
  | { status: 'invalid-file' }
  | { status: 'unsupported-file' }
  | { status: 'media-not-found' }
  | { status: 'subtitle-not-found' }
  | { status: 'ok'; body: string }

export async function getMediaStreamDecision(
  db: LibSQLDatabase,
  id: string,
  client: string | undefined,
): Promise<StreamDecision> {
  const item = await getMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  const sourcePath = await resolveMediaItemFilePath(db, item)

  if (isRawImage(sourcePath)) {
    try {
      return { status: 'raw', data: await convertRawToJpeg(sourcePath) }
    } catch (error) {
      return {
        status: 'raw-error',
        message:
          error instanceof Error ? error.message : 'RAW conversion failed',
      }
    }
  }

  const playbackClient = parsePlaybackClient(client)
  if (
    (item.mediaType.startsWith('audio/') ||
      item.mediaType.startsWith('video/')) &&
    needsTranscoding(
      {
        mediaType: item.mediaType,
        videoCodec: item.fileMetadata.codec,
        audioCodec: item.fileMetadata.audioCodec,
      },
      playbackClient,
    )
  ) {
    return { status: 'hls' }
  }

  return { status: 'direct', item, sourcePath }
}

export async function getMediaHlsPlaylist(
  db: LibSQLDatabase,
  id: string,
): Promise<HlsPlaylistResult> {
  const item = await getMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }

  const duration = Number(
    item.fileMetadata?.duration ?? item.metadata?.duration,
  )
  if (!Number.isFinite(duration) || duration <= 0) {
    return { status: 'duration-unavailable' }
  }

  return {
    status: 'ok',
    playlist: generateHlsPlaylist(
      duration,
      HLS_SEGMENT_DURATION,
      HLS_SEGMENT_VERSION,
    ),
  }
}

export async function startMediaHlsSegment(
  db: LibSQLDatabase,
  id: string,
  segmentIndex: number,
): Promise<HlsSegmentResult> {
  const item = await getMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  const sourcePath = await resolveMediaItemFilePath(db, item)
  return {
    status: 'ok',
    process: spawnTranscodeSegment(
      sourcePath,
      segmentIndex,
      HLS_SEGMENT_DURATION,
    ),
  }
}

export async function getMediaTracks(
  db: LibSQLDatabase,
  id: string,
): Promise<MediaTracks | undefined> {
  const item = await getMediaItem(db, id)
  if (!item) return undefined
  const sourcePath = await resolveMediaItemFilePath(db, item)

  const allTracks = await extractStreamTracks(sourcePath)
  const audioTracks = allTracks
    .filter((track) => track.codecType === 'audio')
    .map((track) => ({
      index: track.index,
      codec: track.codec,
      language: track.language,
      title: track.title,
    }))
  const embeddedSubs = allTracks
    .filter((track) => track.codecType === 'subtitle')
    .map((track) => ({
      type: 'embedded' as const,
      index: track.index,
      codec: track.codec,
      language: track.language,
      title: track.title,
      label: track.title ?? track.language ?? `Track ${track.index}`,
    }))

  const directory = dirname(sourcePath)
  const base = basename(sourcePath, extname(sourcePath))
  let externalSubs: Extract<
    MediaTracks['subtitleTracks'][number],
    { type: 'external' }
  >[] = []

  try {
    const entries = await readdir(directory)
    externalSubs = entries
      .filter((file) => {
        const extension = extname(file).toLowerCase()
        return (
          (extension === '.srt' || extension === '.vtt') &&
          file.startsWith(base)
        )
      })
      .map((file) => {
        const withoutExtension = basename(file, extname(file))
        const suffix = withoutExtension.slice(base.length).replace(/^\./, '')
        const language = suffix || undefined
        return {
          type: 'external' as const,
          file,
          ...(language ? { language } : {}),
          label: language
            ? `${language.toUpperCase()} (external)`
            : `External (${extname(file).slice(1).toUpperCase()})`,
        }
      })
  } catch {
    // An unreadable directory contributes no external subtitle tracks.
  }

  return {
    audioTracks,
    subtitleTracks: [...embeddedSubs, ...externalSubs],
  }
}

export async function loadMediaSubtitle(
  db: LibSQLDatabase,
  id: string,
  file: string,
): Promise<SubtitleResult> {
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    return { status: 'invalid-file' }
  }

  const extension = extname(file).toLowerCase()
  if (extension !== '.srt' && extension !== '.vtt') {
    return { status: 'unsupported-file' }
  }

  const item = await getMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  const sourcePath = await resolveMediaItemFilePath(db, item)

  let content: Buffer
  try {
    content = await readFile(join(dirname(sourcePath), file))
  } catch {
    return { status: 'subtitle-not-found' }
  }

  let body = content.toString('utf-8')
  if (extension === '.srt' && !body.startsWith('WEBVTT')) {
    body = `WEBVTT\n\n${body}`
  }
  return { status: 'ok', body }
}

async function getMediaItem(db: LibSQLDatabase, id: string) {
  const rows = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.publicId, id))
  return rows[0]
}
