import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { ffmpegPath } from './binaries.js'

// Video codecs natively supported by modern browsers (H.264, VP8, VP9, AV1, Theora)
const BROWSER_NATIVE_VIDEO_CODECS = new Set([
  'h264',
  'vp8',
  'vp9',
  'av1',
  'theora',
])

// Audio codecs natively supported by modern browsers
const BROWSER_NATIVE_AUDIO_CODECS = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
  'pcm_s16le',
  'pcm_s24le',
  'pcm_s32le',
])

/** Returns true if the given codecs require server-side transcoding for browser playback. */
export function needsTranscoding(
  videoCodec: string | undefined,
  audioCodec: string | undefined,
): boolean {
  if (videoCodec !== undefined && !BROWSER_NATIVE_VIDEO_CODECS.has(videoCodec))
    return true
  if (audioCodec !== undefined && !BROWSER_NATIVE_AUDIO_CODECS.has(audioCodec))
    return true
  return false
}

/**
 * Generates an HLS playlist (m3u8) for a media file.
 * Segment URLs are relative (e.g. "segment-0.ts"), resolved relative to the playlist URL.
 */
export function generateHlsPlaylist(
  duration: number,
  segmentDuration = 6,
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
    lines.push(`segment-${i}.ts`)
  }

  lines.push('#EXT-X-ENDLIST')
  return lines.join('\n')
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
  const startTime = segmentIndex * segmentDuration
  return spawn(ffmpegPath, [
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
    '-f',
    'mpegts',
    'pipe:1',
  ])
}
