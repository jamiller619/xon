import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataSourceType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScannerHandle } from '../../scanner/scannerHandle.ts'

const createLibrary = vi.hoisted(() => vi.fn())
const getLibraryById = vi.hoisted(() => vi.fn())
const updateLibrary = vi.hoisted(() => vi.fn())
const triggerLibraryScan = vi.hoisted(() => vi.fn())

vi.mock('../../lib/auth.ts', () => ({ default: {} }))

vi.mock('../../services/libraryService.ts', () => ({
  createLibrary,
  getLibraryById,
  updateLibrary,
}))

vi.mock('../../routes/scan.ts', async () => {
  const { Hono } = await import('hono')
  return {
    makeScanRouter: () => new Hono(),
    triggerLibraryScan,
  }
})

const { makeLibrariesRouter } = await import('../../routes/libraries.ts')

const scannerHandle = {} as ScannerHandle

describe('library content type classification', () => {
  let root: string
  let app: Hono

  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(path.join(tmpdir(), 'xon-library-route-'))
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1' } as never)
      c.set('session', { id: 'session-1' } as never)
      await next()
    })
    app.route(
      '/libraries',
      makeLibrariesRouter({} as LibSQLDatabase, scannerHandle),
    )
    createLibrary.mockResolvedValue('library-1')
    getLibraryById.mockImplementation(async () => ({
      id: 'library-1',
      name: 'Library',
      ownerId: 'user-1',
      type: 'audio',
      dataSources: [],
      images: { poster: [] },
    }))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function create(body: Record<string, unknown>) {
    return app.request('/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('infers the type when creation omits it', async () => {
    const album = path.join(root, 'Album')
    await mkdir(album)
    await writeFile(path.join(album, 'Track 01.flac'), '')

    const response = await create({
      name: 'Music',
      dataSources: [{ type: DataSourceType.local, path: root }],
    })

    expect(response.status).toBe(201)
    expect(createLibrary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'audio', ownerId: 'user-1' }),
    )
    expect(triggerLibraryScan).toHaveBeenCalledWith(scannerHandle, 'library-1')
  })

  it('preserves an explicit override without readable local evidence', async () => {
    const response = await create({
      name: 'Videos',
      type: 'video',
      dataSources: [
        {
          type: DataSourceType.local,
          path: path.join(root, 'does-not-exist'),
        },
      ],
    })

    expect(response.status).toBe(201)
    expect(createLibrary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'video' }),
    )
  })

  it('asks for an override when no supported media can be classified', async () => {
    await writeFile(path.join(root, 'README'), '')

    const response = await create({
      name: 'Unknown',
      dataSources: [{ type: DataSourceType.local, path: root }],
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'UNPROCESSABLE_ENTITY',
      },
    })
    expect(createLibrary).not.toHaveBeenCalled()
  })

  it('allows correcting a library type through the update route', async () => {
    getLibraryById.mockResolvedValue({
      id: 'library-1',
      name: 'Library',
      type: 'video',
      dataSources: [],
    })
    updateLibrary.mockResolvedValue({ id: 'library-1', type: 'video/movie' })

    const response = await app.request('/libraries/library-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'video/movie' }),
    })

    expect(response.status).toBe(200)
    expect(updateLibrary).toHaveBeenCalledWith(
      expect.anything(),
      'library-1',
      expect.objectContaining({ type: 'video/movie' }),
    )
  })
})
