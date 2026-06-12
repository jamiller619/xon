import type { MediaItem } from '@xon/shared'
import { asc, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mediaItems, people, peopleMedia } from '../db/schema.ts'

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

export async function getMediaByPath(
  db: LibSQLDatabase,
  filePath: string,
): Promise<MediaItem | undefined> {
  return db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.filePath, filePath))
    .get()
}
