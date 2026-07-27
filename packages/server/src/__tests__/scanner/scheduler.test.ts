import { watch } from 'node:fs'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCronInterval, startScheduler } from '../../scanner/scheduler.ts'
import * as libraryService from '../../services/libraryService.ts'

vi.mock('node:fs', () => ({
  watch: vi.fn(),
}))

vi.mock('../../services/libraryService.ts', () => ({
  getAllLibraries: vi.fn(),
}))

const mockWatch = vi.mocked(watch)
const mockGetAllLibraries = vi.mocked(libraryService.getAllLibraries)
const db = {} as LibSQLDatabase

function library(
  overrides: Partial<
    Awaited<ReturnType<typeof libraryService.getAllLibraries>>[number]
  > = {},
) {
  return {
    id: 'lib-1',
    createdAt: new Date(),
    updatedAt: null,
    ownerId: 'user-1',
    name: 'Library',
    description: null,
    type: 'movies' as const,
    scanSchedule: null,
    dataSources: [],
    ...overrides,
  }
}

describe('parseCronInterval', () => {
  it('parses every-N-minutes pattern', () => {
    expect(parseCronInterval('*/30 * * * *')).toBe(30 * 60 * 1000)
    expect(parseCronInterval('*/1 * * * *')).toBe(60 * 1000)
    expect(parseCronInterval('*/59 * * * *')).toBe(59 * 60 * 1000)
  })

  it('parses every-N-hours pattern', () => {
    expect(parseCronInterval('0 */6 * * *')).toBe(6 * 60 * 60 * 1000)
    expect(parseCronInterval('0 */1 * * *')).toBe(60 * 60 * 1000)
    expect(parseCronInterval('0 */23 * * *')).toBe(23 * 60 * 60 * 1000)
  })

  it('returns null for unsupported or invalid expressions', () => {
    expect(parseCronInterval('* * * * *')).toBeNull()
    expect(parseCronInterval('0 0 * * *')).toBeNull()
    expect(parseCronInterval('*/0 * * * *')).toBeNull()
    expect(parseCronInterval('*/60 * * * *')).toBeNull()
    expect(parseCronInterval('0 */24 * * *')).toBeNull()
    expect(parseCronInterval('not a cron')).toBeNull()
    expect(parseCronInterval('0 */6 1 * *')).toBeNull()
  })
})

describe('startScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWatch.mockReset()
    mockGetAllLibraries.mockReset()
    mockGetAllLibraries.mockResolvedValue([])
    mockWatch.mockReturnValue({ close: vi.fn() } as unknown as ReturnType<
      typeof watch
    >)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls trigger at the scheduled interval', async () => {
    mockGetAllLibraries.mockResolvedValue([
      library({ scanSchedule: '0 */6 * * *' }),
    ])
    const trigger = vi.fn().mockResolvedValue(undefined)
    const handle = await startScheduler(db, trigger)

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)

    expect(trigger).toHaveBeenCalledOnce()
    expect(trigger).toHaveBeenCalledWith(db, 'lib-1')
    handle.stop()
  })

  it('sets up recursive watchers for enabled local sources', async () => {
    mockGetAllLibraries.mockResolvedValue([
      library({
        dataSources: [{ type: 'local', path: '/media/photos' }],
      }),
    ])

    const handle = await startScheduler(db, vi.fn())

    expect(mockWatch).toHaveBeenCalledWith(
      '/media/photos',
      { recursive: true },
      expect.any(Function),
    )
    handle.stop()
  })

  it('does not watch explicitly disabled or plugin sources', async () => {
    mockGetAllLibraries.mockResolvedValue([
      library({
        dataSources: [
          {
            type: 'local',
            path: '/media/disabled',
            watchEnabled: false,
          },
          {
            type: 'plugin',
            path: '/remote',
            pluginId: 'remote-provider',
          },
        ],
      }),
    ])

    const handle = await startScheduler(db, vi.fn())

    expect(mockWatch).not.toHaveBeenCalled()
    handle.stop()
  })

  it('debounces watch events before triggering a scan', async () => {
    mockGetAllLibraries.mockResolvedValue([
      library({
        dataSources: [{ type: 'local', path: '/media/videos' }],
      }),
    ])
    let capturedCallback: (() => void) | undefined
    mockWatch.mockImplementation((_path, _options, callback) => {
      capturedCallback = callback as () => void
      return { close: vi.fn() } as unknown as ReturnType<typeof watch>
    })
    const trigger = vi.fn().mockResolvedValue(undefined)
    const handle = await startScheduler(db, trigger)

    capturedCallback?.()
    capturedCallback?.()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(trigger).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(trigger).toHaveBeenCalledOnce()
    expect(trigger).toHaveBeenCalledWith(db, 'lib-1')
    handle.stop()
  })

  it('closes timers and watchers when stopped', async () => {
    const close = vi.fn()
    mockWatch.mockReturnValue({ close } as unknown as ReturnType<typeof watch>)
    mockGetAllLibraries.mockResolvedValue([
      library({
        scanSchedule: '*/30 * * * *',
        dataSources: [{ type: 'local', path: '/media/photos' }],
      }),
    ])
    const trigger = vi.fn().mockResolvedValue(undefined)
    const handle = await startScheduler(db, trigger)

    handle.stop()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(trigger).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })
})
