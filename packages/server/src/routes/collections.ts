import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
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
import * as collectionService from '../services/collectionService.ts'
import { MANUAL_COLLECTION_TYPES } from '../services/collectionService.ts'

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
        const collection = await collectionService.createCollection(
          db,
          userId,
          body,
        )

        return c.json(collection, 201)
      },
    )

    // GET /collections — list collections owned by the current user
    .get('/', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await collectionService.getPublicCollections(db, user.id)

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
        const query = c.req.valid('query')
        const result = await collectionService.getCollectionMedia(
          db,
          id,
          user.id,
          query,
        )
        if (result.status === 'not_found') {
          return notFound(c, 'Collection not found')
        }

        const { page, limit } = query
        const { items, total } = result
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
      const collection = await collectionService.getPublicCollection(
        db,
        id,
        user.id,
      )
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
        const result = await collectionService.updateCollection(
          db,
          id,
          user.id,
          body,
        )
        if (result.status === 'not_found') {
          return notFound(c, 'Collection not found')
        }
        if (result.status === 'immutable') {
          return errorResponse(
            c,
            403,
            errorCodes.forbidden,
            'Cannot update an auto-generated collection',
          )
        }

        return c.json(result.collection)
      },
    )

    // DELETE /collections/:id — delete collection (manager+)
    .delete('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const user = c.get('user')
      const result = await collectionService.deleteCollection(db, id, user.id)
      if (result.status === 'not_found') {
        return notFound(c, 'Collection not found')
      }
      if (result.status === 'immutable') {
        return errorResponse(
          c,
          403,
          errorCodes.forbidden,
          'Cannot delete an auto-generated collection',
        )
      }

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
        const result = await collectionService.addCollectionItem(
          db,
          collectionId,
          user.id,
          body,
        )
        if (result.status === 'collection_not_found') {
          return notFound(c, 'Collection not found')
        }
        if (result.status === 'media_not_found') {
          return notFound(c, 'Media item not found')
        }

        return result.status === 'updated'
          ? c.json(result.item)
          : c.json(result.item, 201)
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
        const result = await collectionService.reorderCollectionItems(
          db,
          collectionId,
          user.id,
          body.items,
        )
        if (result.status === 'collection_not_found') {
          return notFound(c, 'Collection not found')
        }
        if (result.status === 'items_not_found') {
          return notFound(c, 'One or more collection items were not found')
        }

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
        const result = await collectionService.removeCollectionItem(
          db,
          collectionId,
          user.id,
          mediaItemId,
        )
        if (result.status === 'collection_not_found') {
          return notFound(c, 'Collection not found')
        }
        if (result.status === 'media_not_found') {
          return notFound(c, 'Media item not found')
        }

        return noContent(c)
      },
    )

  return router
}

// Route schema for hono/client (RPC) type inference on the web client.
export type CollectionsRoutes = ReturnType<typeof makeCollectionsRouter>
