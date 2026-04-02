import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { MediaCategory } from '@xon/shared'
import {
  type ExiftoolMetadata,
  extractExiftoolMetadata,
  isImageCategory,
} from '../../media/exiftool.js'

type FakeChildProcess = EventEmitter & { stdout: EventEmitter }

function makeProcess(): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess
  proc.stdout = new EventEmitter()
  return proc
}

const mockSpawn = vi.mocked(spawn)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isImageCategory', () => {
  it('returns true for image categories', () => {
    expect(isImageCategory(MediaCategory.Pictures)).toBe(true)
    expect(isImageCategory(MediaCategory.Images)).toBe(true)
    expect(isImageCategory(MediaCategory.DesignFiles)).toBe(true)
  })

  it('returns false for non-image categories', () => {
    expect(isImageCategory(MediaCategory.Movies)).toBe(false)
    expect(isImageCategory(MediaCategory.Music)).toBe(false)
    expect(isImageCategory(MediaCategory.Documents)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isImageCategory(null)).toBe(false)
  })
})

describe('extractExiftoolMetadata', () => {
  it('extracts full EXIF metadata from exiftool output', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const exifOutput = JSON.stringify([
      {
        ImageWidth: 4000,
        ImageHeight: 3000,
        ColorSpace: 'sRGB',
        Model: 'Canon EOS 5D Mark IV',
        GPSLatitude: 37.7749,
        GPSLongitude: -122.4194,
        DateTimeOriginal: '2024:06:15 14:30:00',
        Orientation: 'Horizontal (normal)',
      },
    ])

    const promise = extractExiftoolMetadata('/photos/photo.jpg')

    proc.stdout.emit('data', Buffer.from(exifOutput))
    proc.emit('close', 0)

    const result = await promise

    expect(result).toEqual<ExiftoolMetadata>({
      width: 4000,
      height: 3000,
      colorSpace: 'sRGB',
      cameraModel: 'Canon EOS 5D Mark IV',
      gpsLatitude: 37.7749,
      gpsLongitude: -122.4194,
      dateTaken: '2024:06:15 14:30:00',
      orientation: 'Horizontal (normal)',
    })
  })

  it('extracts metadata without GPS or camera model', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const exifOutput = JSON.stringify([
      {
        ImageWidth: 1920,
        ImageHeight: 1080,
        ColorSpace: 'Adobe RGB',
        DateTimeOriginal: '2024:01:01 00:00:00',
      },
    ])

    const promise = extractExiftoolMetadata('/images/screenshot.png')

    proc.stdout.emit('data', Buffer.from(exifOutput))
    proc.emit('close', 0)

    const result = await promise

    expect(result?.width).toBe(1920)
    expect(result?.height).toBe(1080)
    expect(result?.colorSpace).toBe('Adobe RGB')
    expect(result?.dateTaken).toBe('2024:01:01 00:00:00')
    expect(result?.cameraModel).toBeUndefined()
    expect(result?.gpsLatitude).toBeUndefined()
  })

  it('uses CreateDate as fallback when DateTimeOriginal is absent', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const exifOutput = JSON.stringify([
      {
        ImageWidth: 800,
        ImageHeight: 600,
        CreateDate: '2023:12:25 12:00:00',
      },
    ])

    const promise = extractExiftoolMetadata('/images/holiday.jpg')

    proc.stdout.emit('data', Buffer.from(exifOutput))
    proc.emit('close', 0)

    const result = await promise

    expect(result?.dateTaken).toBe('2023:12:25 12:00:00')
  })

  it('converts numeric orientation to string', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const exifOutput = JSON.stringify([
      {
        ImageWidth: 640,
        ImageHeight: 480,
        Orientation: 6,
      },
    ])

    const promise = extractExiftoolMetadata('/images/rotated.jpg')

    proc.stdout.emit('data', Buffer.from(exifOutput))
    proc.emit('close', 0)

    const result = await promise

    expect(result?.orientation).toBe('6')
  })

  it('returns null when exiftool is not installed (ENOENT)', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const promise = extractExiftoolMetadata('/photos/photo.jpg')

    const err = Object.assign(new Error('spawn exiftool ENOENT'), {
      code: 'ENOENT',
    })
    proc.emit('error', err)

    const result = await promise

    expect(result).toBeNull()
  })

  it('returns null when exiftool exits with non-zero code', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const promise = extractExiftoolMetadata('/photos/corrupt.jpg')

    proc.emit('close', 1)

    const result = await promise

    expect(result).toBeNull()
  })

  it('returns null when exiftool outputs invalid JSON', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const promise = extractExiftoolMetadata('/photos/photo.jpg')

    proc.stdout.emit('data', Buffer.from('not valid json {{{'))
    proc.emit('close', 0)

    const result = await promise

    expect(result).toBeNull()
  })

  it('returns empty object when exiftool output has no entries', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const promise = extractExiftoolMetadata('/photos/photo.jpg')

    proc.stdout.emit('data', Buffer.from(JSON.stringify([])))
    proc.emit('close', 0)

    const result = await promise

    expect(result).toEqual({})
  })

  it('handles chunked stdout data', async () => {
    const proc = makeProcess()
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>)

    const exifOutput = JSON.stringify([{ ImageWidth: 1024, ImageHeight: 768 }])

    const promise = extractExiftoolMetadata('/photos/photo.jpg')

    const half = Math.floor(exifOutput.length / 2)
    proc.stdout.emit('data', Buffer.from(exifOutput.slice(0, half)))
    proc.stdout.emit('data', Buffer.from(exifOutput.slice(half)))
    proc.emit('close', 0)

    const result = await promise

    expect(result?.width).toBe(1024)
    expect(result?.height).toBe(768)
  })
})
