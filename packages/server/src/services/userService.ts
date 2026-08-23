import { CollectionType } from '@xon/shared'
import { aliasedTable, and, desc, eq, or } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { publicMediaColumns } from '../db/publicSelections.ts'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
  mediaPlayStates,
  users,
} from '../db/schema.ts'
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'

export async function onUserCreate(db: LibSQLDatabase, userId: number) {
  for (const values of [
    {
      title: 'Favorites',
      type: CollectionType.Favorites,
      userId,
    },
    {
      title: 'Watchlist',
      type: CollectionType.Watchlist,
      userId,
    },
  ]) {
    await insertWithGeneratedPublicId(async (publicId) => {
      await db.insert(collections).values({ ...values, publicId })
    })
  }
}

export async function getUsers(db: LibSQLDatabase) {
  return db
    .select({
      id: users.publicId,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      isAnonymous: users.isAnonymous,
    })
    .from(users)
}

export function getResumablePlayStates(db: LibSQLDatabase, userId: number) {
  return db
    .select({
      mediaItemId: mediaItems.publicId,
      position: mediaPlayStates.position,
      duration: mediaPlayStates.duration,
      status: mediaPlayStates.status,
      startedAt: mediaPlayStates.startedAt,
      updatedAt: mediaPlayStates.updatedAt,
      stoppedAt: mediaPlayStates.stoppedAt,
      mediaItem: {
        ...publicMediaColumns,
        libraryId: libraries.publicId,
      },
    })
    .from(mediaPlayStates)
    .innerJoin(mediaItems, eq(mediaPlayStates.mediaItemId, mediaItems.id))
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(
      and(
        eq(mediaPlayStates.userId, userId),
        or(
          eq(mediaPlayStates.status, 'playing'),
          eq(mediaPlayStates.status, 'stopped'),
        ),
      ),
    )
    .orderBy(desc(mediaPlayStates.updatedAt))
    .limit(50)
}

export function getPlayStateProgress(db: LibSQLDatabase, userId: number) {
  return db
    .select({
      mediaItemId: mediaItems.publicId,
      position: mediaPlayStates.position,
      duration: mediaPlayStates.duration,
      status: mediaPlayStates.status,
    })
    .from(mediaPlayStates)
    .innerJoin(mediaItems, eq(mediaPlayStates.mediaItemId, mediaItems.id))
    .where(eq(mediaPlayStates.userId, userId))
}

export async function getUserCollections(db: LibSQLDatabase, userId: number) {
  const parent = aliasedTable(collections, 'parent_collections')
  return db
    .select({
      id: collections.publicId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      type: collections.type,
      title: collections.title,
      parentCollectionId: parent.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .leftJoin(parent, eq(collections.parentCollectionId, parent.id))
    .where(eq(collections.userId, userId))
}

export async function getUserCollectionMediaItems(
  db: LibSQLDatabase,
  collectionPublicId: string,
) {
  const collection = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.publicId, collectionPublicId))
    .get()

  if (!collection) throw new Error('Collection not found')

  return db
    .select({ ...publicMediaColumns, libraryId: libraries.publicId })
    .from(mediaItems)
    .innerJoin(collectionItems, eq(collectionItems.mediaItemId, mediaItems.id))
    .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
    .where(eq(collectionItems.collectionId, collection.id))
    .orderBy(collectionItems.sortOrder)
}
