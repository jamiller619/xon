import { GroupType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { groups, users } from './db/schema.js'

export async function initializeGroups(db: LibSQLDatabase) {
  const userRows = await db.select().from(users)

  for await (const user of userRows) {
    await checkGroupType(db, user.id, GroupType.Favorites)
    await checkGroupType(db, user.id, GroupType.Watchlist)
  }
}

async function checkGroupType(
  db: LibSQLDatabase,
  userId: string,
  type: GroupType,
): Promise<void> {
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.userId, userId), eq(groups.type, type)))

  if (rows.length < 1) {
    await db.insert(groups).values({
      title: type,
      type,
      userId,
    })
  }
}
