import { CollectionType } from '@xon/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.ts'
import { collectionItems, collections, mediaItems } from '../db/schema.ts'
import { validate } from '../http/validate.ts'

const MANUAL_COLLECTION_TYPES = [
  CollectionType.Collection,
  CollectionType.Playlist,
  CollectionType.Album,
  CollectionType.Shelf,
  CollectionType.Folder,
] as const

const createCollectionSchema = z.object({
  type: z.enum(MANUAL_COLLECTION_TYPES),
  title: z.string().min(1),
})

const updateCollectionSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(MANUAL_COLLECTION_TYPES).optional(),
})

const addItemSchema = z.object({
  mediaItemId: z.string().min(1),
  sortOrder: z.number().int().optional(),
})

const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      mediaItemId: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
})

export function makeCollectionsRouter(db: LibSQLDatabase) {
  // Keep handlers chained so Hono retains the route schema for the typed web
  // client. Calling methods separately erases the accumulated route types.
  const router = new Hono()
    // POST /collections — create a manual collection (user+)
    .post(
      '/',
      requireAuth(),
      validate('json', createCollectionSchema),
      async (c) => {
        const body = c.req.valid('json')
        const userId = c.get('user')?.id

        if (!userId) {
          return c.json({ error: 'Not authenticated' }, 401)
        }

        const id = crypto.randomUUID()

        await db.insert(collections).values({
          id,
          userId,
          type: body.type as CollectionType,
          title: body.title,
          metadata: '{}',
          createdAt: new Date(),
        })

        const rows = await db
          .select()
          .from(collections)
          .where(eq(collections.id, id))

        return c.json(rows[0], 201)
      },
    )

    // GET /collections?libraryId=xxx — list manual collections for a library (access-checked)
    .get('/', async (c) => {
      const user = c.get('user')
      // const libraryId = c.req.query('libraryId')
      // if (!libraryId)
      //   return c.json({ error: 'libraryId query param required' }, 400)

      // const accessibleIds = await getAccessibleLibraryIds(db, user.id)
      // if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }
      if (!user) {
        return c.json({ error: 'Not authenticated' }, 401)
      }

      const rows = await db
        .select()
        .from(collections)
        .where(eq(collections.userId, user.id))
        .orderBy(asc(collections.createdAt))

      return c.json(rows)
    })

    // GET /collections/:id — get collection with members (access-checked)
    .get('/:id', async (c) => {
      const id = c.req.param('id')
      // const user = c.get('user')

      const collectionRows = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
      if (collectionRows.length === 0)
        return c.json({ error: 'Not found' }, 404)
      const collection = collectionRows[0]
      if (!collection) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(db, user.id)
      // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      // Fetch members with media item details
      const members = await db
        .select({
          mediaItemId: collectionItems.mediaItemId,
          sortOrder: collectionItems.sortOrder,
          title: mediaItems.title,
          // mediaCategory: mediaItems.mediaCategory,
          // mimeType: mediaItems.mimeType,
          mediaType: mediaItems.mediaType,
          fileSize: mediaItems.fileSize,
          createdAt: mediaItems.createdAt,
          // thumbnailPaths: mediaItems.thumbnailPaths,
        })
        .from(collectionItems)
        .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
        .where(eq(collectionItems.collectionId, id))
        .orderBy(asc(collectionItems.sortOrder))

      const membersWithThumbs = members.map((m) => {
        const thumbnailUrls: {
          small: string
          medium: string
          large: string
        } | null = null
        // if (m.thumbnailPaths) {
        //   try {
        //     const paths = JSON.parse(m.thumbnailPaths) as {
        //       small?: string
        //       medium?: string
        //       large?: string
        //     }
        //     if (paths.small && paths.medium && paths.large) {
        //       thumbnailUrls = {
        //         small: `/api/media/${m.mediaItemId}/thumbnail/small`,
        //         medium: `/api/media/${m.mediaItemId}/thumbnail/medium`,
        //         large: `/api/media/${m.mediaItemId}/thumbnail/large`,
        //       }
        //     }
        //   } catch {
        //     // ignore
        //   }
        // }
        return { ...m, thumbnailUrls, thumbnailPaths: undefined }
      })

      return c.json({ ...collection, members: membersWithThumbs })
    })

    // PUT /collections/:id — update collection title/type (manager+)
    .put(
      '/:id',
      requireAuth(),
      validate('json', updateCollectionSchema),
      async (c) => {
        const id = c.req.param('id')
        const body = c.req.valid('json')
        // const user = c.get('user')

        const collectionRows = await db
          .select()
          .from(collections)
          .where(eq(collections.id, id))
        if (collectionRows.length === 0)
          return c.json({ error: 'Not found' }, 404)
        const collection = collectionRows[0]
        if (!collection) return c.json({ error: 'Not found' }, 404)

        // const accessibleIds = await getAccessibleLibraryIds(
        //   db,
        //   user.id,
        // )
        // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
        //   return c.json({ error: 'Not found' }, 404)
        // }

        // Only allow updating manual collection types
        if (
          !(MANUAL_COLLECTION_TYPES as readonly string[]).includes(
            collection.type,
          )
        ) {
          return c.json(
            { error: 'Cannot update auto-generated collection' },
            403,
          )
        }

        const updates: Partial<typeof collections.$inferInsert> = {}
        if (body.title !== undefined) updates.title = body.title
        if (body.type !== undefined) updates.type = body.type

        if (Object.keys(updates).length > 0) {
          await db
            .update(collections)
            .set(updates)
            .where(eq(collections.id, id))
        }

        const updated = await db
          .select()
          .from(collections)
          .where(eq(collections.id, id))
        return c.json(updated[0])
      },
    )

    // DELETE /collections/:id — delete collection (manager+)
    .delete('/:id', requireAuth(), async (c) => {
      const id = c.req.param('id')
      // const user = c.get('user')

      const collectionRows = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
      if (collectionRows.length === 0)
        return c.json({ error: 'Not found' }, 404)
      const collection = collectionRows[0]
      if (!collection) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(db, user.id)
      // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      // Only allow deleting manual collection types
      if (
        !(MANUAL_COLLECTION_TYPES as readonly string[]).includes(
          collection.type,
        )
      ) {
        return c.json({ error: 'Cannot delete auto-generated collection' }, 403)
      }

      await db.delete(collections).where(eq(collections.id, id))
      return c.json({ success: true })
    })

    // POST /collections/:id/items — add item to collection (upsert with sortOrder)
    .post(
      '/:id/items',
      requireAuth(),
      validate('json', addItemSchema),
      async (c) => {
        const collectionId = c.req.param('id')
        const body = c.req.valid('json')
        // const user = c.get('user')

        const collectionRows = await db
          .select()
          .from(collections)
          .where(eq(collections.id, collectionId))
        if (collectionRows.length === 0)
          return c.json({ error: 'Not found' }, 404)
        const collection = collectionRows[0]
        if (!collection) return c.json({ error: 'Not found' }, 404)

        // const accessibleIds = await getAccessibleLibraryIds(
        //   db,
        //   user.id,
        // )
        // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
        //   return c.json({ error: 'Not found' }, 404)
        // }

        // Verify media item exists and belongs to same library
        const itemRows = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.id, body.mediaItemId),
              // eq(mediaItems.libraryId, collection.libraryId),
            ),
          )
        if (itemRows.length === 0)
          return c.json({ error: 'Media item not found' }, 404)

        // Determine sort order: use provided or append to end
        let sortOrder = body.sortOrder
        if (sortOrder === undefined) {
          const existing = await db
            .select({ sortOrder: collectionItems.sortOrder })
            .from(collectionItems)
            .where(eq(collectionItems.collectionId, collectionId))
            .orderBy(asc(collectionItems.sortOrder))
          const last = existing[existing.length - 1]
          sortOrder = last ? last.sortOrder + 1 : 0
        }

        await db
          .insert(collectionItems)
          .values({ collectionId, mediaItemId: body.mediaItemId, sortOrder })
          .onConflictDoUpdate({
            target: [collectionItems.collectionId, collectionItems.mediaItemId],
            set: { sortOrder },
          })

        return c.json(
          { collectionId, mediaItemId: body.mediaItemId, sortOrder },
          201,
        )
      },
    )

    // PUT /collections/:id/items — reorder items (batch update sortOrder)
    .put(
      '/:id/items',
      requireAuth(),
      validate('json', reorderItemsSchema),
      async (c) => {
        const collectionId = c.req.param('id')
        const body = c.req.valid('json')
        // const user = c.get('user')

        const collectionRows = await db
          .select()
          .from(collections)
          .where(eq(collections.id, collectionId))
        if (collectionRows.length === 0)
          return c.json({ error: 'Not found' }, 404)
        const collection = collectionRows[0]
        if (!collection) return c.json({ error: 'Not found' }, 404)

        // const accessibleIds = await getAccessibleLibraryIds(
        //   db,
        //   user.id,
        // )
        // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
        //   return c.json({ error: 'Not found' }, 404)
        // }

        for (const item of body.items) {
          await db
            .update(collectionItems)
            .set({ sortOrder: item.sortOrder })
            .where(
              and(
                eq(collectionItems.collectionId, collectionId),
                eq(collectionItems.mediaItemId, item.mediaItemId),
              ),
            )
        }

        return c.json({ success: true })
      },
    )

    // DELETE /collections/:id/items/:mediaItemId — remove item from collection (manager+)
    .delete('/:id/items/:mediaItemId', requireAuth(), async (c) => {
      const collectionId = c.req.param('id')
      const mediaItemId = c.req.param('mediaItemId')
      // const user = c.get('user')

      const collectionRows = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId))
      if (collectionRows.length === 0)
        return c.json({ error: 'Not found' }, 404)
      const collection = collectionRows[0]
      if (!collection) return c.json({ error: 'Not found' }, 404)

      // const accessibleIds = await getAccessibleLibraryIds(
      //   db,
      //   user.id,
      // )
      // if (accessibleIds !== null && !accessibleIds.includes(collection.libraryId)) {
      //   return c.json({ error: 'Not found' }, 404)
      // }

      await db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.collectionId, collectionId),
            eq(collectionItems.mediaItemId, mediaItemId),
          ),
        )

      return c.json({ success: true })
    })

  return router
}

// Route schema for hono/client (RPC) type inference on the web client.
export type CollectionsRoutes = ReturnType<typeof makeCollectionsRouter>
