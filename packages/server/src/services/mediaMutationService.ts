import { eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { MediaItem } from '../db/schema.ts'
import { collectionItems, collections, mediaItems } from '../db/schema.ts'

export interface UpdateMediaInput {
  title?: string | undefined
  description?: string | undefined
  tags?: string[] | undefined
}

export type BulkMediaInput =
  | { action: 'delete'; ids: string[] }
  | {
      action: 'update'
      ids: string[]
      updates: {
        genre?: string | undefined
        tags?: string[] | undefined
        contentRating?: 'G' | 'PG' | 'PG-13' | 'R' | 'unrated' | undefined
      }
    }
  | { action: 'move-to-collection'; ids: string[]; collectionId: string }

export type BulkMediaResult =
  | { status: 'items-not-found' }
  | { status: 'collection-not-found' }
  | { status: 'deleted' | 'updated' | 'moved'; count: number }

export async function updateMedia(
  db: LibSQLDatabase,
  id: string,
  input: UpdateMediaInput,
): Promise<MediaItem | undefined> {
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  const item = rows[0]
  if (!item) return undefined

  const updates: Partial<typeof mediaItems.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.tags !== undefined) {
    updates.metadata = { ...item.metadata, tags: [...input.tags] }
  }

  await db.update(mediaItems).set(updates).where(eq(mediaItems.id, id))
  const updated = await db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, id))

  return updated[0] as MediaItem
}

export async function mutateMediaBulk(
  db: LibSQLDatabase,
  input: BulkMediaInput,
): Promise<BulkMediaResult> {
  const rows = await db
    .select({ id: mediaItems.id, metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(inArray(mediaItems.id, input.ids))
  const foundIds = rows.map((row) => row.id)

  if (foundIds.length !== input.ids.length) {
    return { status: 'items-not-found' }
  }

  if (input.action === 'delete') {
    await db.delete(mediaItems).where(inArray(mediaItems.id, foundIds))
    return { status: 'deleted', count: foundIds.length }
  }

  if (input.action === 'update') {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const metadata = {
          ...row.metadata,
          ...(input.updates.genre === undefined
            ? {}
            : { genre: input.updates.genre }),
          ...(input.updates.tags === undefined
            ? {}
            : { tags: [...input.updates.tags] }),
          ...(input.updates.contentRating === undefined
            ? {}
            : { contentRating: input.updates.contentRating }),
        }

        await tx
          .update(mediaItems)
          .set({ metadata, updatedAt: new Date() })
          .where(eq(mediaItems.id, row.id))
      }
    })

    return { status: 'updated', count: foundIds.length }
  }

  const collectionRows = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.id, input.collectionId))
  if (!collectionRows[0]) return { status: 'collection-not-found' }

  await db.transaction(async (tx) => {
    for (const id of foundIds) {
      await tx
        .insert(collectionItems)
        .values({
          collectionId: input.collectionId,
          mediaItemId: id,
          sortOrder: 0,
        })
        .onConflictDoNothing()
    }
  })

  return { status: 'moved', count: foundIds.length }
}
