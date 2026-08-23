import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../../http/authMiddleware.ts'
import { errorCodes, errorResponse, notFound } from '../../http/responses.ts'
import { validate } from '../../http/validate.ts'
import {
  mutateMediaBulk,
  updateMedia,
} from '../../services/mediaMutationService.ts'
import {
  applyMatch,
  getMatchContext,
  getMatchProviders,
  searchMatches,
} from '../../services/metadataMatchingService.ts'

const matchSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
})

const applyMatchSchema = z.object({
  providerId: z.string().min(1).max(200),
  matchId: z.string().min(1).max(200),
})

const updateMediaSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const bulkIdsSchema = z
  .array(z.string().trim().min(1).max(512))
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique')

const bulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), ids: bulkIdsSchema }),
  z.object({
    action: z.literal('update'),
    ids: bulkIdsSchema,
    updates: z
      .object({
        genre: z.string().optional(),
        tags: z.array(z.string()).optional(),
        contentRating: z.enum(['G', 'PG', 'PG-13', 'R', 'unrated']).optional(),
      })
      .refine(
        (updates) =>
          Object.values(updates).some((value) => value !== undefined),
        'At least one update is required',
      ),
  }),
  z.object({
    action: z.literal('move-to-collection'),
    ids: bulkIdsSchema,
    collectionId: z.string().trim().min(1).max(512),
  }),
])

export function makeMediaMetadataRouter(db: LibSQLDatabase) {
  return new Hono()
    .put('/:id', validate('json', updateMediaSchema), async (c) => {
      const updated = await updateMedia(
        db,
        c.req.param('id'),
        c.req.valid('json'),
      )
      if (!updated) return notFound(c, 'Media item not found')
      return c.json(updated)
    })
    .get('/:id/match-providers', async (c) => {
      const context = await getMatchContext(db, c.req.param('id'))
      if (!context) return notFound(c, 'Media item not found')
      return c.json(getMatchProviders(context))
    })
    .get('/:id/matches', validate('query', matchSearchSchema), async (c) => {
      const context = await getMatchContext(db, c.req.param('id'))
      if (!context) return notFound(c, 'Media item not found')
      return c.json({
        providers: await searchMatches(context, c.req.valid('query').query),
      })
    })
    .post('/:id/match', validate('json', applyMatchSchema), async (c) => {
      const context = await getMatchContext(db, c.req.param('id'))
      if (!context) return notFound(c, 'Media item not found')
      const { providerId, matchId } = c.req.valid('json')

      try {
        return c.json(await applyMatch(db, context, providerId, matchId))
      } catch (error) {
        return errorResponse(
          c,
          422,
          errorCodes.unprocessableEntity,
          error instanceof Error ? error.message : String(error),
        )
      }
    })
    .post('/bulk', requireAuth, validate('json', bulkSchema), async (c) => {
      const result = await mutateMediaBulk(
        db,
        c.get('user').id,
        c.req.valid('json'),
      )
      if (result.status === 'items-not-found') {
        return notFound(c, 'One or more media items were not found')
      }
      if (result.status === 'collection-not-found') {
        return notFound(c, 'Collection not found')
      }
      if (result.status === 'deleted') {
        return c.json({ deleted: result.count })
      }
      if (result.status === 'updated') {
        return c.json({ updated: result.count })
      }
      return c.json({ moved: result.count })
    })
}
