import { posix, win32 } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testConfig = vi.hoisted(() => ({ cachePath: '/data/cache' }))

vi.mock('../../config.ts', () => ({
  default: {
    get: () => testConfig.cachePath,
  },
}))

const {
  cacheReference,
  isCacheReference,
  isThumbnailCacheReference,
  libraryImageCacheReference,
  mediaImageCacheReference,
  resolveCacheReference,
  resolveLocalArtworkPath,
  resolveThumbnailCacheReference,
  thumbnailCacheReference,
} = await import('../../media/cachePaths.js')

describe('thumbnail cache paths', () => {
  beforeEach(() => {
    testConfig.cachePath = '/data/cache'
  })

  it('stores references with POSIX separators', () => {
    expect(thumbnailCacheReference('item_small.jpg')).toBe(
      'thumbnails/item_small.jpg',
    )
    expect(posix.sep).toBe('/')
    expect(win32.sep).toBe('\\')
    expect(mediaImageCacheReference('media-1', 'backdrop.jpg')).toBe(
      'media-images/media-1/backdrop.jpg',
    )
    expect(libraryImageCacheReference('library-1', 'poster.png')).toBe(
      'library-images/library-1/poster.png',
    )
    expect(cacheReference('plugin-images', 'tmdb-metadata', 'poster.jpg')).toBe(
      'plugin-images/tmdb-metadata/poster.jpg',
    )
  })

  it('resolves against the current cache root', () => {
    const reference = 'thumbnails/item_small.jpg'
    expect(resolveThumbnailCacheReference(reference)).toBe(
      '/data/cache/thumbnails/item_small.jpg',
    )

    testConfig.cachePath = '/restored/cache'
    expect(resolveThumbnailCacheReference(reference)).toBe(
      '/restored/cache/thumbnails/item_small.jpg',
    )
  })

  it.each([
    '',
    'item_small.jpg',
    '/thumbnails/item_small.jpg',
    'thumbnails/../outside.jpg',
    'thumbnails\\item_small.jpg',
    'https://example.com/thumbnails/item.jpg',
    '/api/media/1/thumbnail',
  ])('rejects invalid cache reference %j', (reference) => {
    expect(isThumbnailCacheReference(reference)).toBe(false)
    expect(() => resolveThumbnailCacheReference(reference)).toThrow()
  })

  it('only resolves cache references and existing absolute local paths', () => {
    expect(resolveLocalArtworkPath('thumbnails/item.jpg')).toBe(
      '/data/cache/thumbnails/item.jpg',
    )
    expect(resolveLocalArtworkPath('/data/images/cover.jpg')).toBe(
      '/data/images/cover.jpg',
    )
    expect(resolveLocalArtworkPath('../outside.jpg')).toBeNull()
    expect(resolveLocalArtworkPath('https://example.com/poster.jpg')).toBeNull()
    expect(resolveCacheReference('media-images/media-1/backdrop.jpg')).toBe(
      '/data/cache/media-images/media-1/backdrop.jpg',
    )
    expect(isCacheReference('library-images/library-1/poster.png')).toBe(true)
  })

  it('rejects file names containing either path separator', () => {
    expect(() => thumbnailCacheReference('../item.jpg')).toThrow()
    expect(() => thumbnailCacheReference('nested/item.jpg')).toThrow()
    expect(() => thumbnailCacheReference('nested\\item.jpg')).toThrow()
  })

  it.each([
    'media-images/../outside.jpg',
    'library-images\\library-1\\poster.jpg',
    'unknown/item.jpg',
  ])('rejects unsafe or unsupported artwork reference %j', (reference) => {
    expect(isCacheReference(reference)).toBe(false)
    expect(() => resolveCacheReference(reference)).toThrow()
  })
})
