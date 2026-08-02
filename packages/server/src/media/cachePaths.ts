import path from 'node:path'
import config from '../config.ts'

const CACHE_DIRECTORIES = new Set([
  'library-images',
  'media-images',
  'plugin-images',
  'thumbnails',
])
const THUMBNAIL_DIRECTORY = 'thumbnails'
const THUMBNAIL_PREFIX = `${THUMBNAIL_DIRECTORY}/`

function assertPathSegment(segment: string): void {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\')
  ) {
    throw new Error('Cache path segments must not contain path separators')
  }
}

/** Create a portable cache-root-relative reference from safe path segments. */
export function cacheReference(...segments: string[]): string {
  if (segments.length < 2 || !CACHE_DIRECTORIES.has(segments[0] ?? '')) {
    throw new Error('Unsupported cache directory')
  }
  for (const segment of segments) assertPathSegment(segment)
  return path.posix.join(...segments)
}

/** Create a portable thumbnail reference for storage in media metadata. */
export function thumbnailCacheReference(fileName: string): string {
  return cacheReference(THUMBNAIL_DIRECTORY, fileName)
}

export function mediaImageCacheReference(
  mediaId: string,
  fileName: string,
): string {
  return cacheReference('media-images', mediaId, fileName)
}

export function libraryImageCacheReference(
  libraryId: string,
  fileName: string,
): string {
  return cacheReference('library-images', libraryId, fileName)
}

/** True when a value is a supported cache-root-relative artwork reference. */
export function isCacheReference(value: string): boolean {
  if (!value || value.includes('\\') || path.posix.isAbsolute(value)) {
    return false
  }

  const normalized = path.posix.normalize(value)
  const [directory] = normalized.split('/')
  return (
    normalized === value &&
    normalized.includes('/') &&
    CACHE_DIRECTORIES.has(directory ?? '') &&
    !normalized.split('/').includes('..')
  )
}

/** True when a value follows the cache-root-relative thumbnail contract. */
export function isThumbnailCacheReference(value: string): boolean {
  return value.startsWith(THUMBNAIL_PREFIX) && isCacheReference(value)
}

/** Resolve a validated stored artwork reference against the current cache. */
export function resolveCacheReference(reference: string): string {
  if (!isCacheReference(reference)) {
    throw new Error(`Invalid cache reference: ${reference}`)
  }

  const root = path.resolve(config.get('appdata.cachePath'))
  const candidate = path.resolve(root, ...reference.split('/'))
  const relative = path.relative(root, candidate)

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Thumbnail cache reference escapes cache root: ${reference}`,
    )
  }

  return candidate
}

export function resolveThumbnailCacheReference(reference: string): string {
  if (!isThumbnailCacheReference(reference)) {
    throw new Error(`Invalid thumbnail cache reference: ${reference}`)
  }
  return resolveCacheReference(reference)
}

/** Resolve a local artwork source without interpreting arbitrary relative paths. */
export function resolveLocalArtworkPath(source: string): string | null {
  if (isCacheReference(source)) {
    return resolveCacheReference(source)
  }

  return path.isAbsolute(source) ? source : null
}
