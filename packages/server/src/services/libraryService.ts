import crypto from 'node:crypto'
import type { Library, MediaType, PageProps, SortProps } from '@xon/shared'
import { and, asc, count, desc, eq, isNull, like, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  publicLibraryColumns,
  publicMediaColumns,
} from '../db/publicSelections.ts'
import {
  type Library as LibraryRecord,
  libraries,
  type MediaItem,
  mediaItems,
  users,
} from '../db/schema.ts'
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'
import { createLogger } from '../logger.ts'

const logger = createLogger('library-service')

type LibraryMediaSortFields = Pick<
  MediaItem,
  'title' | 'fileSize' | 'createdAt'
>

type CreateLibraryInput = Omit<typeof libraries.$inferInsert, 'id' | 'publicId'>

export async function createLibrary(
  db: LibSQLDatabase,
  data: CreateLibraryInput,
): Promise<string> {
  const created = await insertWithGeneratedPublicId(async (publicId) => {
    const [row] = await db
      .insert(libraries)
      .values({
        ...data,
        publicId,
        dataSources: (data.dataSources ?? []).map((source) => ({
          ...source,
          id: source.id || crypto.randomUUID(),
        })),
      })
      .returning({ publicId: libraries.publicId })
    return row
  })

  if (!created) throw new Error('Failed to create library')
  return created.publicId
}

export async function getAllLibraries(db: LibSQLDatabase): Promise<Library[]> {
  return db
    .select({ ...publicLibraryColumns, ownerId: users.publicId })
    .from(libraries)
    .innerJoin(users, eq(libraries.ownerId, users.id))
}

export function getLibraryRecordByPublicId(
  db: LibSQLDatabase,
  publicId: string,
): Promise<LibraryRecord | undefined> {
  return db
    .select()
    .from(libraries)
    .where(eq(libraries.publicId, publicId))
    .get()
}

export async function getLibraryById(
  db: LibSQLDatabase,
  publicId: string,
): Promise<Library | undefined> {
  return db
    .select({ ...publicLibraryColumns, ownerId: users.publicId })
    .from(libraries)
    .innerJoin(users, eq(libraries.ownerId, users.id))
    .where(eq(libraries.publicId, publicId))
    .get()
}

export async function getLibrariesByUserId(
  db: LibSQLDatabase,
  userId: number,
): Promise<Library[]> {
  return db
    .select({ ...publicLibraryColumns, ownerId: users.publicId })
    .from(libraries)
    .innerJoin(users, eq(libraries.ownerId, users.id))
    .where(eq(libraries.ownerId, userId))
}

export async function deleteLibraryById(
  db: LibSQLDatabase,
  publicId: string,
): Promise<boolean> {
  try {
    const deleted = await db
      .delete(libraries)
      .where(eq(libraries.publicId, publicId))
      .returning({ id: libraries.id })
    return deleted.length > 0
  } catch (error) {
    logger.error('Failed to delete library', { publicId, error })
    throw error
  }
}

export async function getMediaByLibraryId(
  db: LibSQLDatabase,
  publicId: string,
  pageProps?: PageProps,
  sortProps?: SortProps<LibraryMediaSortFields>,
  mediaType?: MediaType.MainType,
  unmatchedOnly = false,
) {
  const library = await getLibraryRecordByPublicId(db, publicId)
  if (!library) return { data: [], total: 0 }

  const sortDir = sortProps?.order === 'asc' ? asc : desc
  const pageSize = pageProps?.pageSize ?? 10
  const pageNumber = pageProps?.pageNumber ?? 1
  const offset = (pageNumber - 1) * pageSize
  const filters = and(
    eq(mediaItems.libraryId, library.id),
    mediaType ? like(mediaItems.mediaType, `${mediaType}/%`) : undefined,
    unmatchedOnly ? isNull(mediaItems.matchId) : undefined,
  )

  const results = await db
    .select({ ...publicMediaColumns, libraryId: libraries.publicId })
    .from(mediaItems)
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
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

  return { data: results, total: total[0]?.count ?? 0 }
}

export async function getLibraryStats(db: LibSQLDatabase, publicId: string) {
  const library = await getLibraryRecordByPublicId(db, publicId)
  if (!library) return { totalItems: 0, totalSize: 0 }

  const [stats] = await db
    .select({
      totalItems: count(),
      totalSize: sql<number>`coalesce(sum(${mediaItems.fileSize}), 0)`,
    })
    .from(mediaItems)
    .where(eq(mediaItems.libraryId, library.id))

  return {
    totalItems: stats?.totalItems ?? 0,
    totalSize: Number(stats?.totalSize ?? 0),
  }
}

export async function getMediaByTypeAndLibraryId(
  db: LibSQLDatabase,
  mediaType: MediaType.MainType,
  publicId: string,
) {
  const library = await getLibraryRecordByPublicId(db, publicId)
  if (!library) return []

  return db
    .select({ ...publicMediaColumns, libraryId: libraries.publicId })
    .from(mediaItems)
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(
      and(
        eq(mediaItems.libraryId, library.id),
        like(mediaItems.mediaType, `${mediaType}/%`),
      ),
    )
}

export async function updateLibrary(
  db: LibSQLDatabase,
  publicId: string,
  updates: Partial<Library>,
): Promise<Library | undefined> {
  const { id: _id, ownerId: _ownerId, ...mutableUpdates } = updates
  const normalizedUpdates = mutableUpdates.dataSources
    ? {
        ...mutableUpdates,
        dataSources: mutableUpdates.dataSources.map((source) => ({
          ...source,
          id: source.id || crypto.randomUUID(),
        })),
      }
    : mutableUpdates

  await db
    .update(libraries)
    .set(normalizedUpdates)
    .where(eq(libraries.publicId, publicId))

  return getLibraryById(db, publicId)
}

export async function updateLibraryScanSchedule(
  db: LibSQLDatabase,
  publicId: string,
  scanSchedule: string | null,
): Promise<Library | undefined> {
  const existing = await getLibraryRecordByPublicId(db, publicId)
  if (!existing) return undefined

  await db
    .update(libraries)
    .set({ scanSchedule, updatedAt: new Date() })
    .where(eq(libraries.id, existing.id))

  return getLibraryById(db, publicId)
}
