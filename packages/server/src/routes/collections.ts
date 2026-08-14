import { CollectionType } from '@xon/shared'
import { and, asc, count, desc, eq, inArray, isNull, like } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { collectionItems, collections, mediaItems } from '../db/schema.ts'
import { requireAuth } from '../http/authMiddleware.js'
import {
  cachedJson,
  errorCodes,
  errorResponse,
  noContent,
  notFound,
  setPaginationHeaders,
} from '../http/responses.ts'
import {
  listQuerySchema,
  mediaFilterQuerySchema,
  resourceIdParamsSchema,
  resourceIdSchema,
} from '../http/schemas.ts'
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
  mediaItemId: resourceIdSchema,
  sortOrder: z.number().int().optional(),
})

const reorderItemsSchema = z.object({
  items: z
    .array(
      z.object({
        mediaItemId: resourceIdSchema,
        sortOrder: z.number().int(),
      }),
    )
    .refine(
      (items) =>
        new Set(items.map(({ mediaItemId }) => mediaItemId)).size ===
        items.length,
      'Media item IDs must be unique',
    ),
})

const collectionMediaQuerySchema = listQuerySchema(
  ['sortOrder', 'title', 'fileSize', 'createdAt'] as const,
  { sortBy: 'sortOrder', order: 'asc' },
).extend({
  ...mediaFilterQuerySchema.shape,
})

const collectionItemParamsSchema = resourceIdParamsSchema.extend({
  mediaItemId: resourceIdSchema,
})

export function makeCollectionsRouter(db: LibSQLDatabase) {
  // Keep handlers chained so Hono retains the route schema for the typed web
  // client. Calling methods separately erases the accumulated route types.
  const router = new Hono()
    .use('/:id', validate('param', resourceIdParamsSchema))
    .use('/:id/*', validate('param', resourceIdParamsSchema))
    // POST /collections — create a manual collection (user+)
    .post(
      '/',
      requireAuth,
      validate('json', createCollectionSchema),
      async (c) => {
        const body = c.req.valid('json')
        const userId = c.get('user').id

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

    // GET /collections — list collections owned by the current user
    .get('/', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await db
        .select()
        .from(collections)
        .where(eq(collections.userId, user.id))
        .orderBy(asc(collections.createdAt))

      return cachedJson(c, rows)
    })

    // GET /collections/:id/media — list full media records for a user collection
    .get(
      '/:id/media',
      requireAuth,
      validate('query', collectionMediaQuerySchema),
      async (c) => {
        const id = c.req.param('id')
        const user = c.get('user')
        const collection = await db
          .select({ id: collections.id })
          .from(collections)
          .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
          .get()
        if (!collection) return notFound(c, 'Collection not found')

        const { mediaType, unmatched, sortBy, order, page, limit } =
          c.req.valid('query')
        const filters = and(
          eq(collectionItems.collectionId, id),
          mediaType ? like(mediaItems.mediaType, `${mediaType}/%`) : undefined,
          unmatched ? isNull(mediaItems.matchId) : undefined,
        )
        const sortDirection = order === 'asc' ? asc : desc
        const sortColumn =
          sortBy === 'sortOrder'
            ? collectionItems.sortOrder
            : mediaItems[sortBy]

        const rows = await db
          .select({ item: mediaItems })
          .from(collectionItems)
          .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
          .where(filters)
          .orderBy(sortDirection(sortColumn), asc(mediaItems.id))
          .limit(limit)
          .offset((page - 1) * limit)
        const totals = await db
          .select({ count: count() })
          .from(collectionItems)
          .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
          .where(filters)

        const total = totals[0]?.count ?? 0
        const items = rows.map(({ item }) => item)
        setPaginationHeaders(c, { page, limit, total })
        return cachedJson(c, items, {
          etagSource: { items, page, limit, total },
        })
      },
    )

    // GET /collections/:id — get user-scoped collection metadata
    .get('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const user = c.get('user')
      const collectionRows = await db
        .select()
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
      if (collectionRows.length === 0)
        return notFound(c, 'Collection not found')
      const collection = collectionRows[0]
      if (!collection) return notFound(c, 'Collection not found')

      return cachedJson(c, collection)
    })

    // PUT /collections/:id — update collection title/type (manager+)
    .put(
      '/:id',
      requireAuth,
      validate('json', updateCollectionSchema),
      async (c) => {
        const id = c.req.param('id')
        const body = c.req.valid('json')
        const user = c.get('user')
        const collectionRows = await db
          .select()
          .from(collections)
          .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
        if (collectionRows.length === 0)
          return notFound(c, 'Collection not found')
        const collection = collectionRows[0]
        if (!collection) return notFound(c, 'Collection not found')

        // Only allow updating manual collection types
        if (
          !(MANUAL_COLLECTION_TYPES as readonly string[]).includes(
            collection.type,
          )
        ) {
          return errorResponse(
            c,
            403,
            errorCodes.forbidden,
            'Cannot update an auto-generated collection',
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
    .delete('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const user = c.get('user')
      const collectionRows = await db
        .select()
        .from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, user.id)))
      if (collectionRows.length === 0)
        return notFound(c, 'Collection not found')
      const collection = collectionRows[0]
      if (!collection) return notFound(c, 'Collection not found')

      // Only allow deleting manual collection types
      if (
        !(MANUAL_COLLECTION_TYPES as readonly string[]).includes(
          collection.type,
        )
      ) {
        return errorResponse(
          c,
          403,
          errorCodes.forbidden,
          'Cannot delete an auto-generated collection',
        )
      }

      await db.delete(collections).where(eq(collections.id, id))
      return noContent(c)
    })

    // POST /collections/:id/items — add item to collection (upsert with sortOrder)
    .post(
      '/:id/items',
      requireAuth,
      validate('json', addItemSchema),
      async (c) => {
        const collectionId = c.req.param('id')
        const body = c.req.valid('json')
        const user = c.get('user')
        const collectionRows = await db
          .select()
          .from(collections)
          .where(
            and(
              eq(collections.id, collectionId),
              eq(collections.userId, user.id),
            ),
          )
        if (collectionRows.length === 0)
          return notFound(c, 'Collection not found')
        const collection = collectionRows[0]
        if (!collection) return notFound(c, 'Collection not found')

        // Collections are user-scoped and may contain items from many libraries.
        const itemRows = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(eq(mediaItems.id, body.mediaItemId))
        if (itemRows.length === 0) return notFound(c, 'Media item not found')

        const existingItem = await db
          .select({ mediaItemId: collectionItems.mediaItemId })
          .from(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, collectionId),
              eq(collectionItems.mediaItemId, body.mediaItemId),
            ),
          )
          .get()

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

        const result = {
          collectionId,
          mediaItemId: body.mediaItemId,
          sortOrder,
        }
        return existingItem ? c.json(result) : c.json(result, 201)
      },
    )

    // PUT /collections/:id/items — reorder items (batch update sortOrder)
    .put(
      '/:id/items',
      requireAuth,
      validate('json', reorderItemsSchema),
      async (c) => {
        const collectionId = c.req.param('id')
        const body = c.req.valid('json')
        const user = c.get('user')
        const collectionRows = await db
          .select()
          .from(collections)
          .where(
            and(
              eq(collections.id, collectionId),
              eq(collections.userId, user.id),
            ),
          )
        if (collectionRows.length === 0)
          return notFound(c, 'Collection not found')
        const collection = collectionRows[0]
        if (!collection) return notFound(c, 'Collection not found')

        if (body.items.length > 0) {
          const existingItems = await db
            .select({ mediaItemId: collectionItems.mediaItemId })
            .from(collectionItems)
            .where(
              and(
                eq(collectionItems.collectionId, collectionId),
                inArray(
                  collectionItems.mediaItemId,
                  body.items.map(({ mediaItemId }) => mediaItemId),
                ),
              ),
            )
          if (existingItems.length !== body.items.length) {
            return notFound(c, 'One or more collection items were not found')
          }
        }

        await db.transaction(async (tx) => {
          for (const item of body.items) {
            await tx
              .update(collectionItems)
              .set({ sortOrder: item.sortOrder })
              .where(
                and(
                  eq(collectionItems.collectionId, collectionId),
                  eq(collectionItems.mediaItemId, item.mediaItemId),
                ),
              )
          }
        })

        return c.json({ success: true })
      },
    )

    // DELETE /collections/:id/items/:mediaItemId — remove item from collection (manager+)
    .delete(
      '/:id/items/:mediaItemId',
      requireAuth,
      validate('param', collectionItemParamsSchema),
      async (c) => {
        const collectionId = c.req.param('id')
        const mediaItemId = c.req.param('mediaItemId')
        const user = c.get('user')
        const collectionRows = await db
          .select()
          .from(collections)
          .where(
            and(
              eq(collections.id, collectionId),
              eq(collections.userId, user.id),
            ),
          )
        if (collectionRows.length === 0)
          return notFound(c, 'Collection not found')
        const collection = collectionRows[0]
        if (!collection) return notFound(c, 'Collection not found')

        await db
          .delete(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, collectionId),
              eq(collectionItems.mediaItemId, mediaItemId),
            ),
          )

        return noContent(c)
      },
    )

  return router
}

// Route schema for hono/client (RPC) type inference on the web client.
export type CollectionsRoutes = ReturnType<typeof makeCollectionsRouter>
