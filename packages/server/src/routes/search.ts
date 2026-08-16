import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../http/authMiddleware.ts'
import { cachedJson, setPaginationHeaders } from '../http/responses.ts'
import { paginationQuerySchema } from '../http/schemas.ts'
import { validate } from '../http/validate.ts'
import { getPopularGenres, searchMedia } from '../services/searchService.ts'

const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(128).optional(),
})

const popularGenresQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
})

export function makeSearchRouter(db: LibSQLDatabase) {
  return new Hono()
    .get(
      '/genres',
      requireAuth,
      validate('query', popularGenresQuerySchema),
      async (c) => {
        const user = c.get('user')
        const { limit } = c.req.valid('query')
        const genres = await getPopularGenres(db, { userId: user.id, limit })

        return cachedJson(c, genres)
      },
    )
    .get('/', requireAuth, validate('query', searchQuerySchema), async (c) => {
      const user = c.get('user')
      const { q, category, page, limit } = c.req.valid('query')
      const results = await searchMedia(db, {
        userId: user.id,
        query: q,
        category,
        page,
        limit,
      })

      setPaginationHeaders(c, { page, limit, total: results.total })
      return cachedJson(c, results.data, {
        etagSource: {
          q,
          category,
          page,
          limit,
          total: results.total,
          data: results.data,
        },
      })
    })
}

export type SearchRoutes = ReturnType<typeof makeSearchRouter>
