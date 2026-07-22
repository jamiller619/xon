import crypto from 'node:crypto'
import type { Library, MediaType, PageProps, SortProps } from '@xon/shared'
import { and, asc, count, desc, eq, like } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { libraries, type MediaItem, mediaItems } from '../db/schema.ts'
import { createLogger } from '../logger.ts'

const logger = createLogger('library-service')

type LibraryMediaSortFields = Pick<
  MediaItem,
  'title' | 'fileSize' | 'createdAt'
>

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
  return db.select().from(libraries).where(eq(libraries.ownerId, userId))
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

export async function getMediaByLibraryId(
  db: LibSQLDatabase,
  id: string,
  pageProps?: PageProps,
  sortProps?: SortProps<LibraryMediaSortFields>,
  mediaType?: MediaType.MainType,
) {
  const sortDir = sortProps?.order === 'asc' ? asc : desc
  const pageSize = pageProps?.pageSize ?? 10
  const pageNumber = pageProps?.pageNumber ?? 1
  const offset = (pageNumber - 1) * pageSize
  const filters = and(
    eq(mediaItems.libraryId, id),
    mediaType ? like(mediaItems.mediaType, `${mediaType}/%`) : undefined,
  )

  const results = await db
    .select()
    .from(mediaItems)
    .where(filters)
    .orderBy(
      sortDir(mediaItems[sortProps?.field ?? 'createdAt']),
      asc(mediaItems.id),
    )
    .limit(pageSize)
    .offset(offset)

  const total = await db
    .select({ count: count() })
    .from(mediaItems)
    .where(filters)

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
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.libraryId, libraryId),
        like(mediaItems.mediaType, `${mediaType}/%`),
      ),
    )
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
