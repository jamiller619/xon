import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { resourceIdParamsSchema } from '../../http/schemas.ts'
import { validate } from '../../http/validate.ts'
import { makeMediaArtworkRouter } from './artwork.ts'
import { makeMediaCatalogRouter } from './catalog.ts'
import { makeMediaMetadataRouter } from './metadata.ts'
import { makeMediaPlaybackRouter } from './playback.ts'
import { makeMediaStreamingRouter } from './streaming.ts'

export function makeMediaRouter(db: LibSQLDatabase) {
  return new Hono()
    .use('/:id', validate('param', resourceIdParamsSchema))
    .use('/:id/*', validate('param', resourceIdParamsSchema))
    .route('/', makeMediaCatalogRouter(db))
    .route('/', makeMediaPlaybackRouter(db))
    .route('/', makeMediaArtworkRouter(db))
    .route('/', makeMediaMetadataRouter(db))
    .route('/', makeMediaStreamingRouter(db))
}

export type MediaRoutes = ReturnType<typeof makeMediaRouter>
