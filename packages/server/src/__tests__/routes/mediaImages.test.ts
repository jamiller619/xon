import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testConfig = vi.hoisted(() => ({ cachePath: '' }))
const generateVideoPosters = vi.hoisted(() => vi.fn())

vi.mock('../../config.ts', () => ({
  default: {
    get: () => testConfig.cachePath,
  },
}))

vi.mock('../../services/libraryThumbnailService.ts', () => ({
  rebuildThumbnail: vi.fn(),
}))

vi.mock('../../media/videoThumbnails.ts', () => ({
  generateVideoPosters,
}))

const { makeMediaRouter } = await import('../../routes/media.ts')

type TestMediaItem = {
  id: string
  libraryId: string
  filePath: string
  mediaType: string
  metadata: Record<string, unknown>
  updatedAt?: Date
}

function testDatabase(item: TestMediaItem): LibSQLDatabase {
  return {
    select: () => ({
      from: () => ({
        where: async () => [item],
      }),
    }),
    update: () => ({
      set: (updates: Partial<TestMediaItem>) => ({
        where: async () => {
          Object.assign(item, updates)
        },
      }),
    }),
  } as unknown as LibSQLDatabase
}

describe('Media artwork routes', () => {
  let cachePath: string
  let item: TestMediaItem
  let app: Hono

  beforeEach(async () => {
    cachePath = await mkdtemp(join(tmpdir(), 'xon-media-images-'))
    testConfig.cachePath = cachePath
    item = {
      id: 'media-1',
      libraryId: 'library-1',
      filePath: '/videos/movie.mp4',
      mediaType: 'video/mp4',
      metadata: {
        images: {
          poster: [
            { src: 'https://images.example/first.jpg' },
            { src: 'https://images.example/second.jpg' },
          ],
          backdrop: ['https://images.example/backdrop.jpg'],
          logo: [],
        },
      },
    }
    app = new Hono().route('/media', makeMediaRouter(testDatabase(item)))
  })

  afterEach(async () => {
    await rm(cachePath, { recursive: true, force: true })
  })

  it('persists the explicit order for every artwork section', async () => {
    const images = {
      poster: [
        { src: 'https://images.example/second.jpg' },
        { src: 'https://images.example/first.jpg' },
      ],
      backdrop: [],
      logo: ['https://images.example/logo.png'],
    }

    const response = await app.request('/media/media-1/images', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(images),
    })

    expect(response.status).toBe(200)
    expect((item.metadata.images as { poster: unknown[] }).poster).toEqual(
      images.poster,
    )
    await expect(response.json()).resolves.toEqual({ images })
  })

  it('copies an uploaded image into the configured cache directory', async () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010806000000',
      'hex',
    )
    const form = new FormData()
    form.set('file', new File([png], 'poster.png', { type: 'image/png' }))

    const response = await app.request('/media/media-1/images/poster', {
      method: 'POST',
      body: form,
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      images: { poster: Array<string | { src: string }> }
    }
    const saved = body.images.poster.at(-1)
    expect(typeof saved).toBe('string')
    expect(saved).toMatch(
      new RegExp(
        `^${cachePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/media-images/media-1/`,
      ),
    )
    await expect(readFile(saved as string)).resolves.toEqual(png)
  })

  it('appends three posters generated from the video', async () => {
    const posters = [1, 2, 3].map((index) => ({
      src: `/cache/poster-${index}_large.jpg`,
      thumbnails: {
        small: `/cache/poster-${index}_small.jpg`,
        medium: `/cache/poster-${index}_medium.jpg`,
        large: `/cache/poster-${index}_large.jpg`,
      },
    }))
    generateVideoPosters.mockResolvedValueOnce(posters)

    const response = await app.request(
      '/media/media-1/images/posters/generate',
      { method: 'POST' },
    )

    expect(response.status).toBe(201)
    expect(generateVideoPosters).toHaveBeenCalledWith(
      '/videos/movie.mp4',
      'media-1',
    )
    const body = (await response.json()) as {
      images: { poster: unknown[] }
    }
    expect(body.images.poster.slice(-3)).toEqual(posters)
    expect(
      (item.metadata.images as { poster: unknown[] }).poster.slice(-3),
    ).toEqual(posters)
  })

  it('serves a cached artwork entry with its detected content type', async () => {
    const directory = join(cachePath, 'media-images', item.id)
    const imagePath = join(directory, 'cached.png')
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010806000000',
      'hex',
    )
    await mkdir(directory, { recursive: true })
    await writeFile(imagePath, png)
    item.metadata = {
      images: { poster: [imagePath], backdrop: [], logo: [] },
    }

    const response = await app.request('/media/media-1/images/poster/0')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    await expect(response.arrayBuffer()).resolves.toEqual(
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    )
  })

  it('removes an unreferenced uploaded cache file', async () => {
    const directory = join(cachePath, 'media-images', item.id)
    const imagePath = join(directory, 'old.png')
    await mkdir(directory, { recursive: true })
    await writeFile(imagePath, 'old image')
    item.metadata = {
      images: { poster: [imagePath], backdrop: [], logo: [] },
    }

    const response = await app.request('/media/media-1/images', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poster: [], backdrop: [], logo: [] }),
    })

    expect(response.status).toBe(200)
    await expect(access(imagePath)).rejects.toThrow()
  })
})
