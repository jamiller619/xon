import type { SortProps } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import type { MediaItem } from '../../db/schema.ts'
import { requireAuth } from '../../http/authMiddleware.ts'
import {
  cachedJson,
  notFound,
  setPaginationHeaders,
} from '../../http/responses.ts'
import { booleanQuerySchema, listQuerySchema } from '../../http/schemas.ts'
import { validate } from '../../http/validate.ts'
import { getMediaDetail } from '../../services/mediaDetailService.ts'
import * as mediaService from '../../services/mediaService.ts'

const mediaListQuerySchema = listQuerySchema(
  ['createdAt', 'updatedAt', 'title', 'scannedAt', 'id'] as const,
  { sortBy: 'id', order: 'desc' },
)

const mediaDetailQuerySchema = z.object({
  withLibrary: booleanQuerySchema.optional().default(false),
})

export function makeMediaCatalogRouter(db: LibSQLDatabase) {
  return new Hono()
    .get(
      '/',
      requireAuth,
      validate('query', mediaListQuerySchema),
      async (c) => {
        const user = c.get('user')
        const { sortBy, order, page, limit } = c.req.valid('query')
        const pageProps = { pageNumber: page, pageSize: limit }
        const sortProps: SortProps<MediaItem> = { field: sortBy, order }

        const results = await mediaService.getMediaPageByUser(
          db,
          user.id,
          pageProps,
          sortProps,
        )

        setPaginationHeaders(c, { page, limit, total: results.total })
        return cachedJson(c, results.data, {
          etagSource: {
            items: results.data,
            page,
            limit,
            total: results.total,
          },
        })
      },
    )
    .get('/featured', requireAuth, async (c) => {
      const user = c.get('user')
      const items = await mediaService.getFeaturedMedia(db, user.id)

      return cachedJson(c, items)
    })
    .get('/:id', validate('query', mediaDetailQuerySchema), async (c) => {
      const user = c.get('user')
      const result = await getMediaDetail(db, c.req.param('id'), {
        withLibrary: c.req.valid('query').withLibrary,
        userId: user?.id,
      })

      if (!result) return notFound(c, 'Media item not found')
      return cachedJson(c, result.data, { etagSource: result.etagSource })
    })
    .get('/:id/related', async (c) => {
      const items = await mediaService.getRelatedMedia(db, c.req.param('id'))
      return cachedJson(c, items)
    })
}
