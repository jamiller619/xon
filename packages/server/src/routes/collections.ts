import { CollectionType } from '@xon/shared'
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
} from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { publicMediaColumns } from '../db/publicSelections.ts'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
} from '../db/schema.ts'
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
import { insertWithGeneratedPublicId } from '../lib/publicId.ts'

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

        const created = await insertWithGeneratedPublicId(async (publicId) => {
          const [row] = await db
            .insert(collections)
            .values({
              publicId,
              userId,
              type: body.type as CollectionType,
              title: body.title,
              metadata: '{}',
              createdAt: new Date(),
            })
            .returning({ publicId: collections.publicId })
          return row
        })
        if (!created) throw new Error('Failed to create collection')

        return c.json(
          await getPublicCollection(db, created.publicId, userId),
          201,
        )
      },
    )

    // GET /collections — list collections owned by the current user
    .get('/', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await getPublicCollections(db, user.id)

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
          .where(
            and(eq(collections.publicId, id), eq(collections.userId, user.id)),
          )
          .get()
        if (!collection) return notFound(c, 'Collection not found')

        const { mediaType, unmatched, sortBy, order, page, limit } =
          c.req.valid('query')
        const filters = and(
          eq(collectionItems.collectionId, collection.id),
          mediaType ? like(mediaItems.mediaType, `${mediaType}/%`) : undefined,
          unmatched ? isNull(mediaItems.matchId) : undefined,
        )
        const sortDirection = order === 'asc' ? asc : desc
        const sortColumn =
          sortBy === 'sortOrder'
            ? collectionItems.sortOrder
            : mediaItems[sortBy]

        const rows = await db
          .select({ ...publicMediaColumns, libraryId: libraries.publicId })
          .from(collectionItems)
          .innerJoin(mediaItems, eq(collectionItems.mediaItemId, mediaItems.id))
          .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
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
        const items = rows
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
      const collection = await getPublicCollection(db, id, user.id)
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
        const collection = await getOwnedCollection(db, id, user.id)
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
            .where(eq(collections.id, collection.id))
        }

        return c.json(await getPublicCollection(db, id, user.id))
      },
    )

    // DELETE /collections/:id — delete collection (manager+)
    .delete('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const user = c.get('user')
      const collection = await getOwnedCollection(db, id, user.id)
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

      await db.delete(collections).where(eq(collections.id, collection.id))
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
        const collection = await getOwnedCollection(db, collectionId, user.id)
        if (!collection) return notFound(c, 'Collection not found')

        // Collections are user-scoped and may contain items from many libraries.
        const itemRows = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(eq(mediaItems.publicId, body.mediaItemId))
        if (itemRows.length === 0) return notFound(c, 'Media item not found')
        const mediaItemId = itemRows[0]?.id
        if (mediaItemId === undefined)
          return notFound(c, 'Media item not found')

        const existingItem = await db
          .select({ mediaItemId: collectionItems.mediaItemId })
          .from(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, collection.id),
              eq(collectionItems.mediaItemId, mediaItemId),
            ),
          )
          .get()

        // Determine sort order: use provided or append to end
        let sortOrder = body.sortOrder
        if (sortOrder === undefined) {
          const existing = await db
            .select({ sortOrder: collectionItems.sortOrder })
            .from(collectionItems)
            .where(eq(collectionItems.collectionId, collection.id))
            .orderBy(asc(collectionItems.sortOrder))
          const last = existing[existing.length - 1]
          sortOrder = last ? last.sortOrder + 1 : 0
        }

        await db
          .insert(collectionItems)
          .values({
            collectionId: collection.id,
            mediaItemId,
            sortOrder,
          })
          .onConflictDoUpdate({
            target: [collectionItems.collectionId, collectionItems.mediaItemId],
            set: { sortOrder },
          })

        const result = {
          collectionId: collection.publicId,
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
        const collection = await getOwnedCollection(db, collectionId, user.id)
        if (!collection) return notFound(c, 'Collection not found')

        const publicMediaIds = body.items.map(({ mediaItemId }) => mediaItemId)
        const mediaRows = publicMediaIds.length
          ? await db
              .select({ id: mediaItems.id, publicId: mediaItems.publicId })
              .from(mediaItems)
              .where(inArray(mediaItems.publicId, publicMediaIds))
          : []
        const mediaIdsByPublicId = new Map(
          mediaRows.map((item) => [item.publicId, item.id]),
        )

        if (body.items.length > 0) {
          if (mediaIdsByPublicId.size !== body.items.length) {
            return notFound(c, 'One or more collection items were not found')
          }
          const existingItems = await db
            .select({ mediaItemId: collectionItems.mediaItemId })
            .from(collectionItems)
            .where(
              and(
                eq(collectionItems.collectionId, collection.id),
                inArray(collectionItems.mediaItemId, [
                  ...mediaIdsByPublicId.values(),
                ]),
              ),
            )
          if (existingItems.length !== body.items.length) {
            return notFound(c, 'One or more collection items were not found')
          }
        }

        await db.transaction(async (tx) => {
          for (const item of body.items) {
            const mediaItemId = mediaIdsByPublicId.get(item.mediaItemId)
            if (mediaItemId === undefined) continue
            await tx
              .update(collectionItems)
              .set({ sortOrder: item.sortOrder })
              .where(
                and(
                  eq(collectionItems.collectionId, collection.id),
                  eq(collectionItems.mediaItemId, mediaItemId),
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
        const collection = await getOwnedCollection(db, collectionId, user.id)
        if (!collection) return notFound(c, 'Collection not found')

        const mediaItem = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(eq(mediaItems.publicId, mediaItemId))
          .get()
        if (!mediaItem) return notFound(c, 'Media item not found')

        await db
          .delete(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, collection.id),
              eq(collectionItems.mediaItemId, mediaItem.id),
            ),
          )

        return noContent(c)
      },
    )

  return router
}

function getOwnedCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
) {
  return db
    .select()
    .from(collections)
    .where(
      and(eq(collections.publicId, publicId), eq(collections.userId, userId)),
    )
    .get()
}

function getPublicCollections(db: LibSQLDatabase, userId: number) {
  const parent = aliasedTable(collections, 'parent_collections')
  return db
    .select({
      id: collections.publicId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      type: collections.type,
      title: collections.title,
      parentCollectionId: parent.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .leftJoin(parent, eq(collections.parentCollectionId, parent.id))
    .where(eq(collections.userId, userId))
    .orderBy(asc(collections.createdAt))
}

async function getPublicCollection(
  db: LibSQLDatabase,
  publicId: string,
  userId: number,
) {
  const parent = aliasedTable(collections, 'parent_collection')
  return db
    .select({
      id: collections.publicId,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      type: collections.type,
      title: collections.title,
      parentCollectionId: parent.publicId,
      metadata: collections.metadata,
    })
    .from(collections)
    .leftJoin(parent, eq(collections.parentCollectionId, parent.id))
    .where(
      and(eq(collections.publicId, publicId), eq(collections.userId, userId)),
    )
    .get()
}

// Route schema for hono/client (RPC) type inference on the web client.
export type CollectionsRoutes = ReturnType<typeof makeCollectionsRouter>
