import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata, PosterImage } from '@xon/shared'
import { eq, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  cacheReference,
  isCacheReference,
  isThumbnailCacheReference,
  mediaImageCacheReference,
  resolveCacheReference,
} from '../../media/cachePaths.ts'
import { libraries, mediaItems } from '../schema.ts'

const MIGRATION_ID = '0003_relative_thumbnail_paths'
const LOCAL_ARTWORK_MIGRATION_ID = '0004_relative_local_artwork_paths'

function legacyThumbnailReference(value: string): string {
  if (isThumbnailCacheReference(value)) return value
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('/api/')) {
    return value
  }

  const normalized = value.replaceAll('\\', '/')
  const markerIndex = normalized.lastIndexOf('/thumbnails/')
  if (markerIndex < 0) return value

  const reference = normalized.slice(markerIndex + 1)
  return isThumbnailCacheReference(reference) ? reference : value
}

function legacyCacheReference(value: string): string {
  if (isCacheReference(value)) return value
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('/api/')) {
    return value
  }

  const normalized = value.replaceAll('\\', '/')
  for (const directory of ['thumbnails', 'media-images', 'library-images']) {
    const markerIndex = normalized.lastIndexOf(`/${directory}/`)
    if (markerIndex < 0) continue
    const reference = normalized.slice(markerIndex + 1)
    if (isCacheReference(reference)) return reference
  }
  return value
}

function migratePosterEntry(entry: unknown): {
  value: unknown
  changed: boolean
} {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { value: entry, changed: false }
  }

  const poster = entry as Partial<PosterImage> & Record<string, unknown>
  const thumbnails = poster.thumbnails
  if (!thumbnails || typeof thumbnails !== 'object') {
    return { value: entry, changed: false }
  }

  const originalThumbnailValues = Object.values(thumbnails).filter(
    (value): value is string => typeof value === 'string',
  )
  const nextThumbnails = { ...thumbnails }
  let changed = false

  for (const size of ['small', 'medium', 'large'] as const) {
    const current = thumbnails[size]
    if (typeof current !== 'string') continue
    const next = legacyThumbnailReference(current)
    if (next !== current) {
      nextThumbnails[size] = next
      changed = true
    }
  }

  let src = poster.src
  if (typeof src === 'string' && originalThumbnailValues.includes(src)) {
    const next = legacyThumbnailReference(src)
    if (next !== src) {
      src = next
      changed = true
    }
  }

  if (!changed) return { value: entry, changed: false }
  return {
    value: { ...poster, src, thumbnails: nextThumbnails },
    changed: true,
  }
}

/** Normalize the supported historical poster shapes without touching others. */
export function migrateThumbnailMetadata(metadata: Metadata): {
  metadata: Metadata
  changed: boolean
} {
  const images = metadata.images
  if (!images || typeof images !== 'object') {
    return { metadata, changed: false }
  }

  const imageRecord = images as Record<string, unknown>
  const poster = imageRecord.poster
  const entries = Array.isArray(poster) ? poster : [poster]
  let changed = false
  const migrated = entries.map((entry) => {
    const result = migratePosterEntry(entry)
    changed ||= result.changed
    return result.value
  })

  if (!changed) return { metadata, changed: false }
  return {
    metadata: {
      ...metadata,
      images: {
        ...imageRecord,
        poster: Array.isArray(poster) ? migrated : migrated[0],
      },
    },
    changed: true,
  }
}

function migrateArtworkValue(value: unknown): {
  value: unknown
  changed: boolean
} {
  if (typeof value === 'string') {
    const migrated = legacyCacheReference(value)
    return { value: migrated, changed: migrated !== value }
  }
  if (Array.isArray(value)) {
    let changed = false
    const migrated = value.map((entry) => {
      const result = migrateArtworkValue(entry)
      changed ||= result.changed
      return result.value
    })
    return { value: migrated, changed }
  }
  if (value && typeof value === 'object') {
    const entry = value as Record<string, unknown>
    const src = migrateArtworkValue(entry.src)
    const thumbnails = migrateArtworkValue(entry.thumbnails)
    if (!src.changed && !thumbnails.changed) {
      return { value, changed: false }
    }
    return {
      value: { ...entry, src: src.value, thumbnails: thumbnails.value },
      changed: true,
    }
  }
  return { value, changed: false }
}

/** Convert every cache-backed local artwork field in media metadata. */
export function migrateLocalArtworkMetadata(metadata: Metadata): {
  metadata: Metadata
  changed: boolean
} {
  const thumbnailResult = migrateThumbnailMetadata(metadata)
  const images = thumbnailResult.metadata.images
  if (!images || typeof images !== 'object') return thumbnailResult

  const imageRecord = images as Record<string, unknown>
  let changed = thumbnailResult.changed
  const migratedImages = { ...imageRecord }
  for (const kind of ['poster', 'backdrop', 'logo']) {
    if (!(kind in imageRecord)) continue
    const result = migrateArtworkValue(imageRecord[kind])
    changed ||= result.changed
    migratedImages[kind] = result.value
  }

  if (!changed) return { metadata, changed: false }
  return {
    metadata: { ...thumbnailResult.metadata, images: migratedImages },
    changed: true,
  }
}

export function migrateLibraryArtworkImages(images: { poster: string[] }): {
  images: { poster: string[] }
  changed: boolean
} {
  let changed = false
  const poster = images.poster.map((source) => {
    const migrated = legacyCacheReference(source)
    changed ||= migrated !== source
    return migrated
  })
  return { images: changed ? { ...images, poster } : images, changed }
}

async function migrateLegacyAppDataImageValue(
  value: unknown,
  mediaId: string,
): Promise<{ value: unknown; changed: boolean }> {
  if (typeof value === 'string') {
    if (
      !path.isAbsolute(value) ||
      path.basename(path.dirname(value)) !== 'images'
    ) {
      return { value, changed: false }
    }
    const fileName = path.basename(value)
    const reference = fileName.startsWith(`${mediaId}_cover.`)
      ? mediaImageCacheReference(mediaId, `cover${path.extname(value)}`)
      : cacheReference('plugin-images', 'legacy', fileName)
    const destination = resolveCacheReference(reference)
    try {
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(value, destination)
      return { value: reference, changed: true }
    } catch {
      return { value, changed: false }
    }
  }
  if (Array.isArray(value)) {
    let changed = false
    const migrated = await Promise.all(
      value.map(async (entry) => {
        const result = await migrateLegacyAppDataImageValue(entry, mediaId)
        changed ||= result.changed
        return result.value
      }),
    )
    return { value: migrated, changed }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const src = await migrateLegacyAppDataImageValue(record.src, mediaId)
    return src.changed
      ? { value: { ...record, src: src.value }, changed: true }
      : { value, changed: false }
  }
  return { value, changed: false }
}

async function migrateLegacyAppDataImages(
  metadata: Metadata,
  mediaId: string,
): Promise<Metadata> {
  const images = metadata.images as Record<string, unknown> | undefined
  if (!images) return metadata
  let changed = false
  const migrated = { ...images }
  for (const kind of ['poster', 'backdrop', 'logo']) {
    if (!(kind in images)) continue
    const result = await migrateLegacyAppDataImageValue(images[kind], mediaId)
    changed ||= result.changed
    migrated[kind] = result.value
  }
  return changed ? { ...metadata, images: migrated } : metadata
}

export async function migrateRelativeThumbnailPaths(
  db: LibSQLDatabase,
): Promise<void> {
  // Keep the data migration self-contained. This is intentionally idempotent
  // so startup is safe whether or not the matching Drizzle SQL migration was
  // applied separately first.
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS xon_data_migrations (
      id text PRIMARY KEY NOT NULL,
      applied_at integer NOT NULL
    )
  `)

  const appliedRows = await db.all<{ id: string }>(sql`
    SELECT id FROM xon_data_migrations WHERE id = ${MIGRATION_ID}
  `)
  if (appliedRows.length > 0) return

  const rows = await db
    .select({
      id: mediaItems.id,
      metadata: sql<unknown>`${mediaItems.metadata}`,
    })
    .from(mediaItems)

  await db.transaction(async (tx) => {
    for (const row of rows) {
      let metadata: Metadata
      try {
        metadata =
          typeof row.metadata === 'string'
            ? (JSON.parse(row.metadata) as Metadata)
            : (row.metadata as Metadata)
      } catch {
        continue
      }

      if (!metadata || typeof metadata !== 'object') continue
      const result = migrateThumbnailMetadata(metadata)
      if (!result.changed) continue
      await tx
        .update(mediaItems)
        .set({ metadata: result.metadata })
        .where(eq(mediaItems.id, row.id))
    }

    await tx.run(sql`
      INSERT INTO xon_data_migrations (id, applied_at)
      VALUES (${MIGRATION_ID}, ${Date.now()})
    `)
  })
}

/** One-time conversion for non-thumbnail cache artwork and library images. */
export async function migrateRelativeLocalArtworkPaths(
  db: LibSQLDatabase,
): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS xon_data_migrations (
      id text PRIMARY KEY NOT NULL,
      applied_at integer NOT NULL
    )
  `)
  const appliedRows = await db.all<{ id: string }>(sql`
    SELECT id FROM xon_data_migrations WHERE id = ${LOCAL_ARTWORK_MIGRATION_ID}
  `)
  if (appliedRows.length > 0) return

  const mediaRows = await db
    .select({
      id: mediaItems.id,
      publicId: mediaItems.publicId,
      metadata: sql<unknown>`${mediaItems.metadata}`,
    })
    .from(mediaItems)
  const libraryRows = await db
    .select({
      id: libraries.id,
      images: sql<unknown>`${libraries.images}`,
    })
    .from(libraries)

  await db.transaction(async (tx) => {
    for (const row of mediaRows) {
      let metadata: Metadata
      try {
        metadata =
          typeof row.metadata === 'string'
            ? (JSON.parse(row.metadata) as Metadata)
            : (row.metadata as Metadata)
      } catch {
        continue
      }
      if (!metadata || typeof metadata !== 'object') continue
      const originalMetadata = metadata
      metadata = await migrateLegacyAppDataImages(metadata, row.publicId)
      const result = migrateLocalArtworkMetadata(metadata)
      if (!result.changed && metadata === originalMetadata) continue
      await tx
        .update(mediaItems)
        .set({ metadata: result.metadata })
        .where(eq(mediaItems.id, row.id))
    }

    for (const row of libraryRows) {
      let images: { poster: string[] }
      try {
        images =
          typeof row.images === 'string'
            ? (JSON.parse(row.images) as { poster: string[] })
            : (row.images as { poster: string[] })
      } catch {
        continue
      }
      if (!images || !Array.isArray(images.poster)) continue
      const result = migrateLibraryArtworkImages(images)
      if (!result.changed) continue
      await tx
        .update(libraries)
        .set({ images: result.images })
        .where(eq(libraries.id, row.id))
    }

    await tx.run(sql`
      INSERT INTO xon_data_migrations (id, applied_at)
      VALUES (${LOCAL_ARTWORK_MIGRATION_ID}, ${Date.now()})
    `)
  })
}
