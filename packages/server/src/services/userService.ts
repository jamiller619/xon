import { GroupType } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { groups } from '../db/schema.ts'

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

export async function getUserCollections(db: LibSQLDatabase, userId: string) {
  return db.select().from(groups).where(eq(groups.userId, userId))
}
