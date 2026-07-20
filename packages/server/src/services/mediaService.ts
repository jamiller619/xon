import type { MediaItem, PageProps, SortProps } from '@xon/shared'
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { libraries, mediaItems, people, peopleMedia } from '../db/schema.ts'

export async function getMediaById(
  db: LibSQLDatabase,
  id: string,
): Promise<MediaItem | undefined> {
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))

  const media = rows[0]

  if (!media) {
    return undefined
  }

  const cast = await db
    .select({
      id: people.id,
      name: people.name,
      description: people.description,
      avatarUrl: people.avatarUrl,
      metadata: people.metadata,
      role: peopleMedia.role,
      order: peopleMedia.order,
    })
    .from(peopleMedia)
    .innerJoin(people, eq(peopleMedia.personId, people.id))
    .where(eq(peopleMedia.mediaId, id))
    .orderBy(asc(peopleMedia.order))

  return {
    ...media,
    cast,
  }
}

export async function getMediaByPathAndLibrary(
  db: LibSQLDatabase,
  filePath: string,
  libraryId: string,
): Promise<MediaItem | undefined> {
  return db
    .select()
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.filePath, filePath),
        eq(mediaItems.libraryId, libraryId),
      ),
    )
    .get()
}

export async function getMediaByUser(
  db: LibSQLDatabase,
  userId: string,
  pageProps?: PageProps,
  sortProps?: SortProps<MediaItem>,
) {
  const pageNum = Math.max(1, Number(pageProps?.pageNumber) || 1)
  const limitNum = Math.min(Math.max(1, Number(pageProps?.pageSize) || 20), 100)
  const offset = (pageNum - 1) * limitNum

  const sortDir = sortProps?.order === 'asc' ? asc : desc
  const mediaItemColumns = getTableColumns(mediaItems)
  const sortField = (sortProps?.field || 'id') as keyof typeof mediaItemColumns
  const orderExpr = sortDir(mediaItemColumns[sortField])

  return db
    .select({
      id: mediaItems.id,
      createdAt: mediaItems.createdAt,
      updatedAt: mediaItems.updatedAt,
      libraryId: mediaItems.libraryId,
      filePath: mediaItems.filePath,
      fileSize: mediaItems.fileSize,
      fileMetadata: mediaItems.fileMetadata,
      mediaType: mediaItems.mediaType,
      title: mediaItems.title,
      description: mediaItems.description,
      metadata: mediaItems.metadata,
      drmProtected: mediaItems.drmProtected,
      scannedAt: mediaItems.scannedAt,
      tags: mediaItems.tags,
    })
    .from(mediaItems)
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(eq(libraries.ownerId, userId))
    .orderBy(orderExpr)
    .limit(limitNum)
    .offset(offset)
}

/**
 * Featured = the user's highest-rated items that have backdrop artwork,
 * rotated deterministically per UTC day so the row changes daily but stays
 * stable across requests within a day.
 */
export async function getFeaturedMedia(
  db: LibSQLDatabase,
  userId: string,
  limit = 10,
) {
  // Pull a pool larger than the display limit so the daily rotation has
  // something to rotate through
  const candidatePoolSize = limit * 3

  const voteAverage = sql`json_extract(${mediaItems.metadata}, '$.voteAverage')`

  const candidates = await db
    .select({
      id: mediaItems.id,
      createdAt: mediaItems.createdAt,
      updatedAt: mediaItems.updatedAt,
      libraryId: mediaItems.libraryId,
      filePath: mediaItems.filePath,
      fileSize: mediaItems.fileSize,
      fileMetadata: mediaItems.fileMetadata,
      mediaType: mediaItems.mediaType,
      title: mediaItems.title,
      description: mediaItems.description,
      metadata: mediaItems.metadata,
      drmProtected: mediaItems.drmProtected,
      scannedAt: mediaItems.scannedAt,
      tags: mediaItems.tags,
    })
    .from(mediaItems)
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(
      and(
        eq(libraries.ownerId, userId),
        // Artwork gate: a featured row of gray placeholder cards is worse
        // than a smaller featured row
        sql`json_extract(${mediaItems.metadata}, '$.images.backdrop') IS NOT NULL`,
      ),
    )
    .orderBy(desc(voteAverage))
    .limit(candidatePoolSize)

  const daySeed = new Date().toISOString().slice(0, 10)

  return candidates
    .map((item) => ({ item, sortKey: fnv1a(daySeed + item.id) }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, limit)
    .map((entry) => entry.item)
}

/** FNV-1a string hash — cheap deterministic sort key for the daily rotation. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
