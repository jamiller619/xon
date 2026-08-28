import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { PlaybackClient } from '@xon/shared'
import { ffmpegPath } from './binaries.ts'

type PlaybackProfile = {
  containers: ReadonlySet<string>
  videoCodecs: ReadonlySet<string>
  audioCodecs: ReadonlySet<string>
}

const webProfile: PlaybackProfile = {
  containers: new Set([
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-flac',
    'audio/x-wav',
    'video/mp4',
    'video/ogg',
    'video/webm',
  ]),
  videoCodecs: new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']),
  audioCodecs: new Set([
    'aac',
    'mp3',
    'opus',
    'vorbis',
    'flac',
    'pcm_s16le',
    'pcm_s24le',
    'pcm_s32le',
  ]),
}

const appleProfile: PlaybackProfile = {
  containers: new Set([
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
    'audio/x-wav',
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
  ]),
  videoCodecs: new Set(['h264', 'hevc']),
  audioCodecs: new Set(['aac', 'mp3', 'alac']),
}

const androidProfile: PlaybackProfile = {
  containers: new Set([
    'audio/aac',
    'audio/flac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-flac',
    'audio/x-wav',
    'video/3gpp',
    'video/mp4',
    'video/webm',
  ]),
  videoCodecs: new Set(['h264', 'vp8', 'vp9']),
  audioCodecs: new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']),
}

/**
 * Conservative direct-play baselines for each first-party client. Profiles
 * can be split further by client version or hardware capability later without
 * changing the stream route contract.
 */
export const PLAYBACK_PROFILES: Readonly<
  Record<PlaybackClient, PlaybackProfile>
> = {
  web: webProfile,
  ios: appleProfile,
  'apple-tv': appleProfile,
  android: androidProfile,
  'android-tv': androidProfile,
}

export type PlaybackMedia = {
  mediaType: string
  videoCodec?: string | undefined
  audioCodec?: string | undefined
}

/** Returns true when the selected client cannot direct-play the media. */
export function needsTranscoding(
  media: PlaybackMedia,
  client: PlaybackClient,
): boolean {
  const profile = PLAYBACK_PROFILES[client]
  if (!profile.containers.has(media.mediaType)) return true
  if (
    media.videoCodec !== undefined &&
    !profile.videoCodecs.has(normalizeCodec(media.videoCodec))
  )
    return true
  if (
    media.audioCodec !== undefined &&
    !profile.audioCodecs.has(normalizeCodec(media.audioCodec))
  )
    return true
  return false
}

function normalizeCodec(codec: string): string {
  const normalized = codec.trim().toLowerCase()

  // music-metadata uses a display name for MP3 while ffprobe uses `mp3`.
  // Treat both metadata sources as the same playback capability.
  if (/^mpeg (?:1|2|2\.5) layer 3$/.test(normalized)) return 'mp3'

  return normalized
}

/**
 * Generates an HLS playlist (m3u8) for a media file.
 * Segment URLs are relative (e.g. "segment-0.ts"), resolved relative to the playlist URL.
 */
export function generateHlsPlaylist(
  duration: number,
  segmentDuration = 6,
  segmentVersion?: string,
): string {
  const totalSegments = Math.ceil(duration / segmentDuration)
  const lines: string[] = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
  ]

  for (let i = 0; i < totalSegments; i++) {
    const actual = Math.min(segmentDuration, duration - i * segmentDuration)
    lines.push(`#EXTINF:${actual.toFixed(3)},`)
    lines.push(
      `segment-${i}.ts${segmentVersion ? `?v=${encodeURIComponent(segmentVersion)}` : ''}`,
    )
  }

  lines.push('#EXT-X-ENDLIST')
  return lines.join('\n')
}

/**
 * Build an independent HLS segment while keeping its timestamps on the media
 * timeline. Without the offset every FFmpeg process starts near zero, causing
 * HLS clients to treat segment 1 as overlapping segment 0.
 */
export function buildTranscodeSegmentArgs(
  filePath: string,
  segmentIndex: number,
  segmentDuration: number,
): string[] {
  const startTime = segmentIndex * segmentDuration
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(startTime),
    '-i',
    filePath,
    '-t',
    String(segmentDuration),
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-preset',
    'veryfast',
    '-output_ts_offset',
    String(startTime),
    '-muxdelay',
    '0',
    '-muxpreload',
    '0',
    '-f',
    'mpegts',
    'pipe:1',
  ]
}

/**
 * Spawns an FFmpeg process to transcode a specific HLS segment on-the-fly.
 * The transcoded MPEG-TS segment is written to stdout (pipe:1).
 */
export function spawnTranscodeSegment(
  filePath: string,
  segmentIndex: number,
  segmentDuration: number,
): ChildProcess {
  const proc = spawn(
    ffmpegPath,
    buildTranscodeSegmentArgs(filePath, segmentIndex, segmentDuration),
  )
  // The route streams stdout only; drain stderr so FFmpeg can never block on a
  // full diagnostics pipe during a long playback session.
  proc.stderr?.resume()
  return proc
}
