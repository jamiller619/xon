import { parsePlaybackClient } from '@xon/shared'
import { describe, expect, it } from 'vitest'
import {
  buildTranscodeSegmentArgs,
  generateHlsPlaylist,
  needsTranscoding,
} from '../../media/transcode.ts'

describe('parsePlaybackClient', () => {
  it('accepts registered clients and safely defaults unknown clients', () => {
    expect(parsePlaybackClient('apple-tv')).toBe('apple-tv')
    expect(parsePlaybackClient('future-client')).toBe('web')
    expect(parsePlaybackClient(undefined)).toBe('web')
  })
})

describe('needsTranscoding', () => {
  it('returns false when both codecs are undefined', () => {
    expect(needsTranscoding({ mediaType: 'video/mp4' }, 'web')).toBe(false)
  })

  it('returns false for native H.264 video + AAC audio', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        'web',
      ),
    ).toBe(false)
  })

  it('returns true for browser-compatible codecs in a Matroska container', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/x-matroska',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        'web',
      ),
    ).toBe(true)
  })

  it('returns false for browser-compatible codecs in an MP4 container', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        'web',
      ),
    ).toBe(false)
  })

  it('returns false for VP9 video + opus audio', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/webm',
          videoCodec: 'vp9',
          audioCodec: 'opus',
        },
        'web',
      ),
    ).toBe(false)
  })

  it('returns false for AV1 video + flac audio', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/webm',
          videoCodec: 'av1',
          audioCodec: 'flac',
        },
        'web',
      ),
    ).toBe(false)
  })

  it('returns true for HEVC (h265) video', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'hevc',
          audioCodec: 'aac',
        },
        'web',
      ),
    ).toBe(true)
  })

  it('allows HEVC direct play on Apple clients', () => {
    const media = {
      mediaType: 'video/mp4',
      videoCodec: 'hevc',
      audioCodec: 'aac',
    }
    expect(needsTranscoding(media, 'ios')).toBe(false)
    expect(needsTranscoding(media, 'apple-tv')).toBe(false)
  })

  it('returns true for unknown video codec', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'wmv3',
          audioCodec: 'mp3',
        },
        'web',
      ),
    ).toBe(true)
  })

  it('returns true for non-native audio codec alone', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'h264',
          audioCodec: 'ac3',
        },
        'web',
      ),
    ).toBe(true)
  })

  it('returns false for native video with no audio codec', () => {
    expect(
      needsTranscoding({ mediaType: 'video/mp4', videoCodec: 'h264' }, 'web'),
    ).toBe(false)
  })

  it('returns true when video codec is non-native and audio is native', () => {
    expect(
      needsTranscoding(
        {
          mediaType: 'video/mp4',
          videoCodec: 'mpeg4',
          audioCodec: 'aac',
        },
        'web',
      ),
    ).toBe(true)
  })

  it('uses the Android profile independently from web', () => {
    const media = {
      mediaType: 'video/3gpp',
      videoCodec: 'h264',
      audioCodec: 'aac',
    }
    expect(needsTranscoding(media, 'android')).toBe(false)
    expect(needsTranscoding(media, 'android-tv')).toBe(false)
    expect(needsTranscoding(media, 'web')).toBe(true)
  })
})

describe('generateHlsPlaylist', () => {
  it('generates a valid m3u8 header', () => {
    const playlist = generateHlsPlaylist(12)
    expect(playlist).toContain('#EXTM3U')
    expect(playlist).toContain('#EXT-X-VERSION:3')
    expect(playlist).toContain('#EXT-X-TARGETDURATION:6')
    expect(playlist).toContain('#EXT-X-MEDIA-SEQUENCE:0')
    expect(playlist).toContain('#EXT-X-ENDLIST')
  })

  it('generates correct number of segments for 12s at 6s per segment', () => {
    const playlist = generateHlsPlaylist(12, 6)
    const segments = playlist
      .split('\n')
      .filter((l) => l.startsWith('segment-'))
    expect(segments).toHaveLength(2)
    expect(segments[0]).toBe('segment-0.ts')
    expect(segments[1]).toBe('segment-1.ts')
  })

  it('generates correct number of segments for 15s at 6s per segment (ceil)', () => {
    const playlist = generateHlsPlaylist(15, 6)
    const segments = playlist
      .split('\n')
      .filter((l) => l.startsWith('segment-'))
    expect(segments).toHaveLength(3)
  })

  it('last segment has correct trimmed duration', () => {
    const playlist = generateHlsPlaylist(15, 6)
    const lines = playlist.split('\n')
    const lastExtinf = lines.findLast((l) => l.startsWith('#EXTINF:'))
    // Last segment is 15 - 12 = 3 seconds
    expect(lastExtinf).toBe('#EXTINF:3.000,')
  })

  it('uses default segment duration of 6 when not specified', () => {
    const playlist = generateHlsPlaylist(6)
    expect(playlist).toContain('#EXT-X-TARGETDURATION:6')
  })

  it('respects custom segment duration', () => {
    const playlist = generateHlsPlaylist(10, 4)
    expect(playlist).toContain('#EXT-X-TARGETDURATION:4')
    const segments = playlist
      .split('\n')
      .filter((l) => l.startsWith('segment-'))
    expect(segments).toHaveLength(3) // ceil(10/4)=3
  })

  it('can version segment URLs to invalidate stale transcoding output', () => {
    const playlist = generateHlsPlaylist(6, 6, '2')
    expect(playlist).toContain('segment-0.ts?v=2')
  })
})

describe('buildTranscodeSegmentArgs', () => {
  it('offsets each segment onto the original media timeline', () => {
    const args = buildTranscodeSegmentArgs('/media/movie.mkv', 2, 6)
    const valueAfter = (flag: string) => args[args.indexOf(flag) + 1]

    expect(valueAfter('-ss')).toBe('12')
    expect(valueAfter('-output_ts_offset')).toBe('12')
    expect(valueAfter('-muxdelay')).toBe('0')
    expect(valueAfter('-muxpreload')).toBe('0')
  })
})
