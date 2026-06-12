import crypto from 'node:crypto'
import type { Library, MediaType } from '@xon/shared'
import { and, asc, count, desc, eq, like } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  libraries,
  libraryMediaItems,
  type MediaItem,
  mediaItems,
} from '../db/schema.ts'
import { createLogger } from '../logger.ts'

const logger = createLogger('library-service')

export async function createLibrary(
  db: LibSQLDatabase,
  data: typeof libraries.$inferInsert,
) {
  const libraryId = data.id ?? crypto.randomUUID()

  await db.insert(libraries).values({
    ...data,
    id: libraryId,
  })

  return libraryId
}

export async function getAllLibraries(db: LibSQLDatabase) {
  return db.select().from(libraries)
}

export async function getLibraryById(
  db: LibSQLDatabase,
  id: string,
): Promise<Library | undefined> {
  const data = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .get()

  return data
}

export async function getLibrariesByUserId(
  db: LibSQLDatabase,
  userId: string,
): Promise<Library[] | undefined> {
  return db.select().from(libraries).where(eq(libraries.userId, userId))
}

export async function deleteLibraryById(db: LibSQLDatabase, id: string) {
  try {
    await db.delete(libraries).where(eq(libraries.id, id))

    return true
  } catch (error) {
    logger.error('Failed to delete library', { id, error })

    return false
  }
}

type PageProps = {
  pageNumber: number
  pageSize: number
}

type SortProps<T> = {
  field: keyof T
  order: 'asc' | 'desc'
}

export async function getMediaByLibraryId(
  db: LibSQLDatabase,
  id: string,
  pageProps?: PageProps,
  sortProps?: SortProps<MediaItem>,
) {
  const sortDir = sortProps?.order === 'asc' ? asc : desc
  const pageSize = pageProps?.pageSize ?? 10
  const pageNumber = pageProps?.pageNumber ?? 1
  const offset = pageNumber - 1 * pageSize

  const results = await db
    .select()
    .from(libraryMediaItems)
    .where(eq(libraryMediaItems.libraryId, id))
    .innerJoin(mediaItems, eq(mediaItems.id, libraryMediaItems.mediaItemId))
    .orderBy(sortDir(mediaItems[sortProps?.field ?? 'id']))
    .limit(pageSize)
    .offset(offset)
    .then((rows) => rows.map((row) => row.media_items))

  const total = await db
    .select({ count: count() })
    .from(libraryMediaItems)
    .where(eq(libraryMediaItems.libraryId, id))

  return {
    data: results,
    total: total[0]?.count ?? 0,
  }
}

export async function getMediaByTypeAndLibraryId(
  db: LibSQLDatabase,
  mediaType: MediaType.MainType,
  libraryId: string,
) {
  return db
    .select()
    .from(libraryMediaItems)
    .where(
      and(
        eq(libraryMediaItems.libraryId, libraryId),
        like(mediaItems.mediaType, `${mediaType}/%`),
      ),
    )
    .innerJoin(mediaItems, eq(mediaItems.id, libraryMediaItems.mediaItemId))
    .then((rows) => rows.map((row) => row.media_items))
}

export async function updateLibrary(
  db: LibSQLDatabase,
  id: string,
  updates: Partial<Library>,
): Promise<Library | undefined> {
  await db.update(libraries).set(updates).where(eq(libraries.id, id))

  const results = await db.select().from(libraries).where(eq(libraries.id, id))

  return results[0]
}
