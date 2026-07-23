import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mkdir = vi.hoisted(() => vi.fn())
const unlink = vi.hoisted(() => vi.fn())
const spawn = vi.hoisted(() => vi.fn())
const writeThumbnailImages = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({ mkdir, unlink }))
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('../../config.ts', () => ({
  default: {
    get: (key: string) => (key === 'appdata.path' ? '/data' : '/data/cache'),
  },
}))
vi.mock('../../media/thumbnails.ts', () => ({ writeThumbnailImages }))

const { generateVideoPosters, generateVideoThumbnails } = await import(
  '../../media/videoThumbnails.js'
)

type FakeProc = EventEmitter & {
  stdout: EventEmitter & { resume: ReturnType<typeof vi.fn> }
  stderr: EventEmitter & { resume: ReturnType<typeof vi.fn> }
}

type ProcSpec =
  | { type: 'ffprobe'; duration?: number; exitCode?: number }
  | { type: 'ffmpeg'; exitCode?: number }
  | { type: 'error'; error: Error }

function makeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = Object.assign(new EventEmitter(), { resume: vi.fn() })
  proc.stderr = Object.assign(new EventEmitter(), { resume: vi.fn() })
  return proc
}

function setupSpawnMock(specs: ProcSpec[]): void {
  let callIndex = 0
  spawn.mockImplementation(() => {
    const spec = specs[callIndex++]
    const proc = makeProc()

    Promise.resolve().then(() => {
      if (spec?.type === 'ffprobe') {
        proc.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              format:
                spec.duration == null
                  ? {}
                  : { duration: String(spec.duration) },
            }),
          ),
        )
        proc.emit('close', spec.exitCode ?? 0)
      } else if (spec?.type === 'ffmpeg') {
        proc.emit('close', spec.exitCode ?? 0)
      } else if (spec?.type === 'error') {
        proc.emit('error', spec.error)
      }
    })

    return proc as unknown as ChildProcess
  })
}

function thumbnailPaths(name: string) {
  return {
    small: `/data/cache/thumbnails/${name}_small.jpg`,
    medium: `/data/cache/thumbnails/${name}_medium.jpg`,
    large: `/data/cache/thumbnails/${name}_large.jpg`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mkdir.mockResolvedValue(undefined)
  unlink.mockResolvedValue(undefined)
  writeThumbnailImages.mockImplementation((name: string) =>
    Promise.resolve(thumbnailPaths(name)),
  )
})

describe('generateVideoThumbnails', () => {
  it('extracts a frame at 10% and writes its thumbnail set', async () => {
    setupSpawnMock([{ type: 'ffprobe', duration: 200 }, { type: 'ffmpeg' }])

    const result = await generateVideoThumbnails('/videos/movie.mp4', 'media-1')

    expect(spawn.mock.calls[1]?.[1]).toContain('20')
    expect(writeThumbnailImages).toHaveBeenCalledWith(
      'media-1',
      '/data/.tmp/media-1_tmp.jpg',
    )
    expect(result).toEqual(thumbnailPaths('media-1'))
    expect(unlink).toHaveBeenCalledWith('/data/.tmp/media-1_tmp.jpg')
  })

  it('returns undefined when frame extraction fails', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 100 },
      { type: 'ffmpeg', exitCode: 1 },
    ])

    await expect(
      generateVideoThumbnails('/videos/movie.mp4', 'media-1'),
    ).resolves.toBeUndefined()
    expect(writeThumbnailImages).not.toHaveBeenCalled()
  })
})

describe('generateVideoPosters', () => {
  it('creates three poster sets from three random video times', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 100 },
      { type: 'ffmpeg' },
      { type: 'ffmpeg' },
      { type: 'ffmpeg' },
    ])
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(1)

    const result = await generateVideoPosters('/videos/movie.mp4', 'media-1')

    expect(result).toHaveLength(3)
    expect(writeThumbnailImages).toHaveBeenCalledTimes(3)
    expect(spawn.mock.calls.slice(1).map((call) => call[1])).toEqual([
      expect.arrayContaining(['5']),
      expect.arrayContaining(['50']),
      expect.arrayContaining(['95']),
    ])
    for (const poster of result ?? []) {
      expect(poster.src).toBe(poster.thumbnails?.large)
    }
  })

  it('does not create posters without a known video duration', async () => {
    setupSpawnMock([{ type: 'ffprobe' }])

    await expect(
      generateVideoPosters('/videos/movie.mp4', 'media-1'),
    ).resolves.toBeUndefined()
    expect(writeThumbnailImages).not.toHaveBeenCalled()
  })
})
