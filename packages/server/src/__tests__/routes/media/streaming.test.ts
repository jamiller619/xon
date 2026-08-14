import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createReadStream = vi.hoisted(() => vi.fn())
const readdir = vi.hoisted(() => vi.fn())
const readFile = vi.hoisted(() => vi.fn())
const resolveMediaItemFilePath = vi.hoisted(() => vi.fn())
const extractStreamTracks = vi.hoisted(() => vi.fn())
const convertRawToJpeg = vi.hoisted(() => vi.fn())
const isRawImage = vi.hoisted(() => vi.fn())
const generateHlsPlaylist = vi.hoisted(() => vi.fn())
const needsTranscoding = vi.hoisted(() => vi.fn())
const spawnTranscodeSegment = vi.hoisted(() => vi.fn())

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createReadStream,
}))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readdir,
  readFile,
}))
vi.mock('../../../media/mediaFilePaths.ts', () => ({
  resolveMediaItemFilePath,
}))
vi.mock('../../../media/ffprobe.ts', () => ({ extractStreamTracks }))
vi.mock('../../../media/raw.ts', () => ({ convertRawToJpeg, isRawImage }))
vi.mock('../../../media/transcode.ts', () => ({
  generateHlsPlaylist,
  needsTranscoding,
  spawnTranscodeSegment,
}))

const { makeMediaStreamingRouter } = await import(
  '../../../routes/media/streaming.ts'
)

type MediaRow = {
  id: string
  filePath: string
  fileSize: number
  fileMetadata: Record<string, unknown>
  mediaType: string
  metadata: Record<string, unknown>
}

describe('media streaming routes', () => {
  let item: MediaRow | undefined
  let app: Hono

  beforeEach(() => {
    item = mediaItem()
    app = new Hono().route('/media', makeMediaStreamingRouter(testDatabase()))
    createReadStream.mockReset()
    createReadStream.mockImplementation(() =>
      Readable.from(Buffer.from('media')),
    )
    readdir.mockReset()
    readFile.mockReset()
    resolveMediaItemFilePath.mockReset()
    resolveMediaItemFilePath.mockResolvedValue('/media/movie.mp4')
    extractStreamTracks.mockReset()
    extractStreamTracks.mockResolvedValue([])
    convertRawToJpeg.mockReset()
    isRawImage.mockReset()
    isRawImage.mockReturnValue(false)
    generateHlsPlaylist.mockReset()
    needsTranscoding.mockReset()
    needsTranscoding.mockReturnValue(false)
    spawnTranscodeSegment.mockReset()
  })

  it('returns 404 for unknown media', async () => {
    item = undefined
    const response = await app.request('/media/missing/stream')
    expect(response.status).toBe(404)
  })

  it('serves full and ranged direct-play responses', async () => {
    const full = await app.request('/media/media-1/stream')
    expect(full.status).toBe(200)
    expect(full.headers.get('Content-Length')).toBe('100')
    expect(createReadStream).toHaveBeenCalledWith('/media/movie.mp4')

    const partial = await app.request('/media/media-1/stream', {
      headers: { Range: 'bytes=10-19' },
    })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('Content-Range')).toBe('bytes 10-19/100')
    expect(partial.headers.get('Content-Length')).toBe('10')
    expect(createReadStream).toHaveBeenLastCalledWith('/media/movie.mp4', {
      start: 10,
      end: 19,
    })

    const invalid = await app.request('/media/media-1/stream', {
      headers: { Range: 'bytes=200-' },
    })
    expect(invalid.status).toBe(416)
    expect(invalid.headers.get('Content-Range')).toBe('bytes */100')
  })

  it('redirects unsupported video but never transcodes an ordinary image', async () => {
    needsTranscoding.mockReturnValue(true)
    const redirected = await app.request('/media/media-1/stream?client=web')
    expect(redirected.status).toBe(307)
    expect(redirected.headers.get('Location')).toBe(
      '/api/media/media-1/hls/playlist.m3u8',
    )

    item = mediaItem({ mediaType: 'image/jpeg' })
    needsTranscoding.mockClear()
    const image = await app.request('/media/media-1/stream?client=web')
    expect(image.status).toBe(200)
    expect(needsTranscoding).not.toHaveBeenCalled()
  })

  it('converts RAW images and reports conversion failures', async () => {
    isRawImage.mockReturnValue(true)
    convertRawToJpeg.mockResolvedValueOnce(Buffer.from('jpeg'))

    const converted = await app.request('/media/media-1/stream')
    expect(converted.status).toBe(200)
    expect(converted.headers.get('Content-Type')).toContain('image/jpeg')
    await expect(converted.text()).resolves.toBe('jpeg')

    convertRawToJpeg.mockRejectedValueOnce(new Error('dcraw unavailable'))
    const failed = await app.request('/media/media-1/stream')
    expect(failed.status).toBe(500)
    expect(await failed.json()).toMatchObject({
      error: { message: 'dcraw unavailable' },
    })
  })

  it('serves HLS playlists and segment streams', async () => {
    item = mediaItem({ fileMetadata: { duration: 60 } })
    generateHlsPlaylist.mockReturnValue('#EXTM3U')

    const playlist = await app.request('/media/media-1/hls/playlist.m3u8')
    expect(playlist.status).toBe(200)
    expect(await playlist.text()).toBe('#EXTM3U')
    expect(generateHlsPlaylist).toHaveBeenCalledWith(60, 6, '2')

    const proc = fakeTranscodeProcess()
    spawnTranscodeSegment.mockReturnValue(proc)
    const segment = await app.request('/media/media-1/hls/segment-2.ts')
    expect(segment.status).toBe(200)
    expect(segment.headers.get('Content-Type')).toContain('video/mp2t')
    expect(spawnTranscodeSegment).toHaveBeenCalledWith('/media/movie.mp4', 2, 6)

    const invalid = await app.request('/media/media-1/hls/not-a-segment')
    expect(invalid.status).toBe(400)
  })

  it('returns embedded/external tracks and converts SRT subtitles', async () => {
    extractStreamTracks.mockResolvedValue([
      {
        index: 1,
        codecType: 'audio',
        codec: 'aac',
        language: 'eng',
        title: 'Main',
      },
      {
        index: 2,
        codecType: 'subtitle',
        codec: 'subrip',
        language: 'spa',
      },
    ])
    readdir.mockResolvedValue(['movie.en.srt', 'other.srt'])

    const tracks = await app.request('/media/media-1/tracks')
    expect(tracks.status).toBe(200)
    expect(await tracks.json()).toMatchObject({
      audioTracks: [{ index: 1, codec: 'aac', language: 'eng' }],
      subtitleTracks: [
        { type: 'embedded', index: 2, language: 'spa' },
        { type: 'external', file: 'movie.en.srt', language: 'en' },
      ],
    })

    readFile.mockResolvedValue(Buffer.from('1\n00:00:00,000 --> 00:00:01,000'))
    const subtitle = await app.request(
      '/media/media-1/subtitle?file=movie.en.srt',
    )
    expect(subtitle.status).toBe(200)
    expect(await subtitle.text()).toMatch(/^WEBVTT\n\n/)

    const traversal = await app.request(
      '/media/media-1/subtitle?file=..%2Fsecret.srt',
    )
    expect(traversal.status).toBe(400)
  })

  function testDatabase(): LibSQLDatabase {
    return {
      select: () => ({
        from: () => ({
          where: async () => (item ? [item] : []),
        }),
      }),
    } as unknown as LibSQLDatabase
  }
})

function mediaItem(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: 'media-1',
    filePath: 'movie.mp4',
    fileSize: 100,
    fileMetadata: { codec: 'h264', audioCodec: 'aac' },
    mediaType: 'video/mp4',
    metadata: {},
    ...overrides,
  }
}

function fakeTranscodeProcess() {
  const process = new EventEmitter() as EventEmitter & {
    stdout: Readable
    exitCode: number | null
    killed: boolean
    kill: ReturnType<typeof vi.fn>
  }
  process.stdout = Readable.from(Buffer.from('segment'))
  process.exitCode = null
  process.killed = false
  process.kill = vi.fn(() => {
    process.killed = true
  })
  return process
}
