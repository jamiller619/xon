// import { and, asc, eq, inArray, sql } from 'drizzle-orm'
// import type { LibSQLDatabase } from 'drizzle-orm/libsql'
// import { Hono } from 'hono'
// import { z } from 'zod'
// import {
//   // libraryAccess,
//   matchingQueue,
//   mediaItems,
// } from '../db/schema.ts'
// import { validate } from '../http/validate.ts'

// // import { withThumbnailUrls } from './media.ts'

// const PRIVILEGED_ROLES = ['admin', 'manager'] as const

// // async function getAccessibleLibraryIds(
// //   db: LibSQLDatabase,
// //   userId: string,
// //   role: string,
// // ): Promise<string[] | null> {
// //   if ((PRIVILEGED_ROLES as readonly string[]).includes(role)) return null
// //   const rows = await db
// //     .select({ libraryId: libraryAccess.libraryId })
// //     .from(libraryAccess)
// //     .where(eq(libraryAccess.userId, userId))
// //   return rows.map((r) => r.libraryId)
// // }

// export function makeMatchingRouter(db: LibSQLDatabase): Hono {
//   const router = new Hono()

//   /**
//    * GET /matching/pending
//    * Returns pending matching queue items with their associated media item info.
//    * Results are filtered to libraries accessible to the requesting user.
//    */
//   router.get('/pending', async (c) => {
//     const user = c.get('user')
//     const limitNum = Math.min(
//       Math.max(1, Number(c.req.query('limit') || 20)),
//       100,
//     )
//     const offsetNum = Math.max(0, Number(c.req.query('offset') || 0))

//     // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)

//     const rows = await db
//       .select({
//         queueItem: matchingQueue,
//         mediaItem: mediaItems,
//       })
//       .from(matchingQueue)
//       .innerJoin(mediaItems, eq(matchingQueue.mediaItemId, mediaItems.id))
//       .where(
//         // and(
//         eq(matchingQueue.status, 'pending'),
//         // accessibleIds !== null
//         //   ? inArray(mediaItems.libraryId, accessibleIds)
//         //   : undefined,
//         // ),
//       )
//       .orderBy(asc(matchingQueue.createdAt))
//       .limit(limitNum)
//       .offset(offsetNum)

//     const items = rows.map(({ queueItem, mediaItem }) => ({
//       ...queueItem,
//       suggestedMetadata: (() => {
//         try {
//           return JSON.parse(queueItem.suggestedMetadata) as Record<
//             string,
//             unknown
//           >
//         } catch {
//           return {}
//         }
//       })(),
//       mediaItem,
//       // mediaItem: withThumbnailUrls(mediaItem),
//     }))

//     return c.json({ items, limit: limitNum, offset: offsetNum })
//   })

//   const confirmSchema = z.object({}).optional()

//   /**
//    * PUT /matching/:id/confirm
//    * Confirms a pending match: updates the media item's title and metadata,
//    * then marks the queue entry as confirmed.
//    */
//   router.put('/:id/confirm', validate('json', confirmSchema), async (c) => {
//     const { id } = c.req.param()
//     const user = c.get('user')

//     const queueRows = await db
//       .select()
//       .from(matchingQueue)
//       .where(eq(matchingQueue.id, id))
//     if (queueRows.length === 0) {
//       return c.json({ error: 'Not found' }, 404)
//     }
//     const queueItem = queueRows[0]
//     if (!queueItem) {
//       return c.json({ error: 'Not found' }, 404)
//     }
//     if (queueItem.status !== 'pending') {
//       return c.json({ error: 'Queue item is not pending' }, 409)
//     }

//     // Verify user has access to the library containing this media item
//     const mediaRows = await db
//       .select({
//         libraryId: mediaItems.libraryId,
//         metadata: mediaItems.metadata,
//       })
//       .from(mediaItems)
//       .where(eq(mediaItems.id, queueItem.mediaItemId))
//     if (mediaRows.length === 0) {
//       return c.json({ error: 'Media item not found' }, 404)
//     }
//     const mediaRow = mediaRows[0]
//     if (!mediaRow) {
//       return c.json({ error: 'Media item not found' }, 404)
//     }

//     // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
//     // if (accessibleIds !== null && !accessibleIds.includes(mediaRow.libraryId)) {
//     //   return c.json({ error: 'Forbidden' }, 403)
//     // }

//     // Merge suggested metadata into existing metadata
//     const existingMeta = mediaRow.metadata
//     let suggestedMeta: Record<string, unknown> = {}
//     try {
//       suggestedMeta = JSON.parse(queueItem.suggestedMetadata) as Record<
//         string,
//         unknown
//       >
//     } catch {
//       // keep empty
//     }
//     const mergedMetadata = {
//       ...existingMeta,
//       ...suggestedMeta,
//     }

//     // Update media item
//     await db
//       .update(mediaItems)
//       .set({
//         title: queueItem.suggestedTitle,
//         metadata: mergedMetadata,
//         updatedAt: new Date(),
//       })
//       .where(eq(mediaItems.id, queueItem.mediaItemId))

//     // Mark queue item confirmed
//     await db
//       .update(matchingQueue)
//       .set({ status: 'confirmed', updatedAt: new Date() })
//       .where(eq(matchingQueue.id, id))

//     const updated = await db
//       .select()
//       .from(matchingQueue)
//       .where(eq(matchingQueue.id, id))
//     return c.json(updated[0])
//   })

//   /**
//    * PUT /matching/:id/reject
//    * Rejects a pending match, leaving the media item unchanged.
//    */
//   router.put('/:id/reject', async (c) => {
//     const { id } = c.req.param()
//     const user = c.get('user')

//     const queueRows = await db
//       .select()
//       .from(matchingQueue)
//       .where(eq(matchingQueue.id, id))
//     if (queueRows.length === 0) {
//       return c.json({ error: 'Not found' }, 404)
//     }
//     const queueItem = queueRows[0]
//     if (!queueItem) {
//       return c.json({ error: 'Not found' }, 404)
//     }
//     if (queueItem.status !== 'pending') {
//       return c.json({ error: 'Queue item is not pending' }, 409)
//     }

//     // Verify library access
//     const mediaRows = await db
//       .select({ libraryId: mediaItems.libraryId })
//       .from(mediaItems)
//       .where(eq(mediaItems.id, queueItem.mediaItemId))
//     if (mediaRows.length === 0) {
//       return c.json({ error: 'Media item not found' }, 404)
//     }
//     const mediaRow = mediaRows[0]
//     if (!mediaRow) {
//       return c.json({ error: 'Media item not found' }, 404)
//     }

//     // const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role)
//     // if (accessibleIds !== null && !accessibleIds.includes(mediaRow.libraryId)) {
//     //   return c.json({ error: 'Forbidden' }, 403)
//     // }

//     await db
//       .update(matchingQueue)
//       .set({ status: 'rejected', updatedAt: new Date() })
//       .where(eq(matchingQueue.id, id))

//     const updated = await db
//       .select()
//       .from(matchingQueue)
//       .where(eq(matchingQueue.id, id))
//     return c.json(updated[0])
//   })

//   return router
// }
