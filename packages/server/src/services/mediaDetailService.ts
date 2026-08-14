import { and, asc, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { collectionItems, collections } from '../db/schema.ts'
import * as mediaService from './mediaService.ts'

export interface MediaDetailOptions {
  withLibrary: boolean
  userId?: string | undefined
}

export async function getMediaDetail(
  db: LibSQLDatabase,
  id: string,
  options: MediaDetailOptions,
) {
  const data = options.withLibrary
    ? await mediaService.getMediaByIdWithLibrary(db, id)
    : await mediaService.getMediaById(db, id)

  if (!data) return undefined

  const collectionIds = options.userId
    ? (
        await db
          .select({ collectionId: collectionItems.collectionId })
          .from(collectionItems)
          .innerJoin(
            collections,
            eq(collectionItems.collectionId, collections.id),
          )
          .where(
            and(
              eq(collectionItems.mediaItemId, id),
              eq(collections.userId, options.userId),
            ),
          )
          .orderBy(asc(collectionItems.collectionId))
      ).map(({ collectionId }) => collectionId)
    : []

  return {
    data: { ...data, collectionIds },
    etagSource: [data.updatedAt?.getTime(), collectionIds],
  }
}
