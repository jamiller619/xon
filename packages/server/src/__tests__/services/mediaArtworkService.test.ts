import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testConfig = vi.hoisted(() => ({ cachePath: '' }))

vi.mock('../../config.ts', () => ({
  default: { get: () => testConfig.cachePath },
}))
vi.mock('../../services/libraryThumbnailService.ts', () => ({
  rebuildThumbnail: vi.fn(),
}))

const { getMediaThumbnail } = await import(
  '../../services/mediaArtworkService.ts'
)

describe('mediaArtworkService', () => {
  beforeEach(async () => {
    testConfig.cachePath = await mkdtemp(join(tmpdir(), 'xon-artwork-service-'))
  })

  afterEach(async () => {
    await rm(testConfig.cachePath, { recursive: true, force: true })
  })

  it('reads a generated thumbnail through its cache-root reference', async () => {
    const reference = 'thumbnails/media-1_medium.jpg'
    await mkdir(join(testConfig.cachePath, 'thumbnails'), { recursive: true })
    await writeFile(join(testConfig.cachePath, reference), 'thumbnail')

    const result = await getMediaThumbnail(
      itemDatabase({
        images: {
          poster: [
            {
              src: 'thumbnails/media-1_large.jpg',
              thumbnails: {
                small: 'thumbnails/media-1_small.jpg',
                medium: reference,
                large: 'thumbnails/media-1_large.jpg',
              },
            },
          ],
        },
      }),
      'media-1',
      'medium',
    )

    expect(result).toMatchObject({
      status: 'ok',
      contentType: 'image/jpeg',
      source: 'thumbnails/media-1_large.jpg',
    })
    if (result.status === 'ok') expect(result.data.toString()).toBe('thumbnail')
  })

  it('distinguishes a missing media item from missing artwork', async () => {
    await expect(
      getMediaThumbnail(itemDatabase(undefined), 'media-1', 'medium'),
    ).resolves.toEqual({ status: 'media-not-found' })
    await expect(
      getMediaThumbnail(itemDatabase({}), 'media-1', 'medium'),
    ).resolves.toEqual({ status: 'image-not-found' })
  })
})

function itemDatabase(
  metadata: Record<string, unknown> | undefined,
): LibSQLDatabase {
  const item = metadata
    ? { id: 'media-1', libraryId: 'library-1', metadata }
    : undefined
  return {
    select: () => ({
      from: () => ({ where: async () => (item ? [item] : []) }),
    }),
  } as unknown as LibSQLDatabase
}
