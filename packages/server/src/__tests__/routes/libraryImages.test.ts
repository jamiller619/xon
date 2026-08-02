import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScannerHandle } from '../../scanner/scannerHandle.ts'

const getLibraryById = vi.hoisted(() => vi.fn())
const updateLibrary = vi.hoisted(() => vi.fn())
const generateLibraryPoster = vi.hoisted(() => vi.fn())
const removeLibraryPoster = vi.hoisted(() => vi.fn())

vi.mock('../../auth/middleware.ts', () => ({
  requireAuth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock('../../services/libraryService.ts', () => ({
  getLibraryById,
  updateLibrary,
}))

vi.mock('../../services/libraryThumbnailService.ts', () => ({
  generateLibraryPoster,
  getOrBuildThumbnail: vi.fn(),
  removeLibraryPoster,
  storeLibraryPoster: vi.fn(),
}))

const { makeLibrariesRouter } = await import('../../routes/libraries.ts')

const library = {
  id: 'library-1',
  name: 'Movies',
  images: {
    poster: ['library-images/library-1/first.png'],
  },
}

const scannerHandle = {
  startScan: vi.fn(),
  refreshMetadata: vi.fn(),
  onScanTriggered: vi.fn(),
  stop: vi.fn(),
} as unknown as ScannerHandle

describe('Library artwork routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    getLibraryById.mockResolvedValue(structuredClone(library))
    app = new Hono().route(
      '/libraries',
      makeLibrariesRouter({} as LibSQLDatabase, scannerHandle),
    )
  })

  it('appends a newly generated poster-grid image', async () => {
    generateLibraryPoster.mockResolvedValue(
      'library-images/library-1/generated.png',
    )

    const response = await app.request(
      '/libraries/library-1/images/posters/generate',
      { method: 'POST' },
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      images: {
        poster: [
          'library-images/library-1/first.png',
          'library-images/library-1/generated.png',
        ],
      },
    })
    expect(updateLibrary).toHaveBeenCalledWith(
      expect.anything(),
      'library-1',
      expect.objectContaining({
        images: {
          poster: [
            'library-images/library-1/first.png',
            'library-images/library-1/generated.png',
          ],
        },
      }),
    )
  })

  it('persists poster order and removes discarded cached images', async () => {
    const response = await app.request('/libraries/library-1/images', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poster: [] }),
    })

    expect(response.status).toBe(200)
    expect(removeLibraryPoster).toHaveBeenCalledWith(
      'library-1',
      'library-images/library-1/first.png',
    )
  })

  it('rejects image sources that were not created for the library', async () => {
    const response = await app.request('/libraries/library-1/images', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poster: ['/some/other/image.png'] }),
    })

    expect(response.status).toBe(400)
    expect(updateLibrary).not.toHaveBeenCalled()
  })
})
