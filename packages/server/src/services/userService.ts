import { GroupType } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { groupItems, groups, mediaItems, users } from '../db/schema.ts'

export async function onUserCreate(db: LibSQLDatabase, userId: string) {
  await db.insert(groups).values([
    {
      title: 'Favorites',
      type: GroupType.Favorites,
      userId,
    },
    {
      title: 'Watchlist',
      type: GroupType.Watchlist,
      userId,
    },
  ])
}

export async function getUsers(db: LibSQLDatabase) {
  return db.select().from(users)
}

export async function getUserCollections(db: LibSQLDatabase, userId: string) {
  return db.select().from(groups).where(eq(groups.userId, userId))
}

export async function getUserCollectionMediaItems(
  db: LibSQLDatabase,
  collectionId: string,
) {
  const collection = await db
    .select()
    .from(groups)
    .where(eq(groups.id, collectionId))
    .get()

  if (!collection) {
    throw new Error('Collection not found')
  }

  return db
    .select()
    .from(mediaItems)
    .innerJoin(groupItems, eq(groupItems.mediaItemId, mediaItems.id))
    .where(eq(groupItems.groupId, collectionId))
    .orderBy(groupItems.sortOrder)
    .then((rows) => rows.map((row) => row.media_items))
}
