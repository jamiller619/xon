import { CollectionType } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import {
  collectionItems,
  collections,
  mediaItems,
  users,
} from '../db/schema.ts'

export async function onUserCreate(db: LibSQLDatabase, userId: string) {
  await db.insert(collections).values([
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
  ])
}

export async function getUsers(db: LibSQLDatabase) {
  return db.select().from(users)
}

export async function getUserCollections(db: LibSQLDatabase, userId: string) {
  return db.select().from(collections).where(eq(collections.userId, userId))
}

export async function getUserCollectionMediaItems(
  db: LibSQLDatabase,
  collectionId: string,
) {
  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .get()

  if (!collection) {
    throw new Error('Collection not found')
  }

  return db
    .select()
    .from(mediaItems)
    .innerJoin(collectionItems, eq(collectionItems.mediaItemId, mediaItems.id))
    .where(eq(collectionItems.collectionId, collectionId))
    .orderBy(collectionItems.sortOrder)
    .then((rows) => rows.map((row) => row.media_items))
}
