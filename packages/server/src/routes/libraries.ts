import { readFile } from 'node:fs/promises'
import { DataSourceType, type Library, LibraryType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.ts'
import { appCache, computeETag } from '../cache.ts'
import type { MediaItem } from '../db/schema.ts'
import { validate } from '../http/validate.ts'
import type { ScannerHandle } from '../scanner/scannerHandle.ts'
import * as libraryService from '../services/libraryService.ts'
import { getOrBuildThumbnail } from '../services/libraryThumbnailService.ts'
import { makeScanRouter, triggerLibraryScan } from './scan.ts'

const LIBRARIES_ALL_KEY = 'libraries:all'

const libraryMediaQuerySchema = z.object({
  types: z.array(z.enum(LibraryType)).optional(),
  sortBy: z
    .enum(['title', 'fileSize', 'releaseDate', 'rating', 'createdAt'])
    .optional(),
  order: z.enum(['asc', 'desc']),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

const createLibrarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(LibraryType),
  scanSchedule: z.string().optional(),
  dataSources: z.array(
    z.object({
      path: z.string().min(1),
      type: z.enum(DataSourceType),
      pluginId: z.string().optional(),
      watchEnabled: z.boolean().optional(),
    }),
  ),
})

const updateLibrarySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scanSchedule: z.string().optional(),
  dataSources: z
    .array(
      z.object({
        path: z.string().min(1).optional(),
        type: z.enum(DataSourceType).optional(),
        pluginId: z.string().optional(),
        watchEnabled: z.boolean().optional(),
      }),
    )
    .optional(),
})

export function makeLibrariesRouter(
  db: LibSQLDatabase,
  scannerHandle: ScannerHandle,
) {
  // Handlers are chained so route types accumulate on the returned Hono
  // instance — required for hono/client (RPC) type inference.
  const router = new Hono()
    .post(
      '/',
      // requireAuth(),
      validate('json', createLibrarySchema),
      async (c) => {
        const body = c.req.valid('json')
        // biome-ignore lint/style/noNonNullAssertion: middleware
        const user = c.get('user')!

        const id = await libraryService.createLibrary(db, {
          ...body,
          ownerId: user.id,
        })

        appCache.invalidate(LIBRARIES_ALL_KEY)
        const library = await libraryService.getLibraryById(db, id)

        triggerLibraryScan(scannerHandle, id)

        return c.json(library, 201)
      },
    )

    // GET /libraries — list accessible libraries (admin/manager see all; user/guest see granted)
    .get('/', async (c) => {
      const user = c.get('user')

      if (!user) {
        return c.json({ error: 'Not authenticated' }, 401)
      }

      const libraries = await libraryService.getLibrariesByUserId(db, user.id)

      const etag = computeETag(libraries)
      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
      c.header('ETag', etag)

      return c.json(libraries)
    })

    // GET /libraries/:id — get single library with data sources (access-checked)
    .get('/:id', async (c) => {
      const id = c.req.param('id')
      const user = c.get('user')

      if (!user) {
        return c.json({ error: 'Not authenticated' }, 401)
      }

      const library = await libraryService.getLibraryById(db, id)

      if (library == null) return c.json({ error: 'Not found' }, 404)

      const etag = computeETag(library)

      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
      c.header('ETag', etag)

      return c.json(library)
    })

    // PUT /libraries/:id — update library (manager+)
    .put(
      '/:id',
      requireAuth(),
      validate('json', updateLibrarySchema),
      async (c) => {
        const id = c.req.param('id')
        const body = c.req.valid('json')
        const existing = await libraryService.getLibraryById(db, id)

        if (!existing) return c.json({ error: 'Not found' }, 404)

        const updates: Partial<Library> = {
          updatedAt: new Date(),
        }
        if (body.name != null) updates.name = body.name
        if (body.description != null) updates.description = body.description

        const updated = await libraryService.updateLibrary(db, id, updates)

        appCache.invalidate(LIBRARIES_ALL_KEY)

        return c.json(updated)
      },
    )

    // DELETE /libraries/:id — delete library and associated data sources (manager+)
    .delete('/:id', requireAuth(), async (c) => {
      const id = c.req.param('id')
      const result = await libraryService.deleteLibraryById(db, id)

      appCache.invalidate(LIBRARIES_ALL_KEY)

      return c.json({ success: result })
    })

    // GET /libraries/:libraryId/media — list media items with filtering, sorting, pagination
    .get(
      '/:libraryId/media',
      validate('query', libraryMediaQuerySchema),
      async (c) => {
        const libraryId = c.req.param('libraryId') as string
        const user = c.get('user')

        if (!user) {
          return c.json({ error: 'Not authenticated' }, 401)
        }

        const { sortBy, order, page, limit } = c.req.valid('query')
        const pageProps = {
          pageNumber: page,
          pageSize: limit,
        }

        const sortProps = {
          field: sortBy as keyof MediaItem,
          order,
        }

        const results = await libraryService.getMediaByLibraryId(
          db,
          libraryId,
          pageProps,
          sortProps,
        )

        c.header('X-Total-Count', String(results.total))

        const etag = computeETag(results.data)

        if (c.req.header('If-None-Match') === etag) {
          return c.body(null, 304)
        }

        c.header('ETag', etag)

        return c.json(results.data)
      },
    )

    // GET /libraries/:id/thumbnail — cached poster-grid thumbnail, built on
    // first request and regenerated when the library's scan completes
    .get('/:id/thumbnail', async (c) => {
      const id = c.req.param('id')

      const library = await libraryService.getLibraryById(db, id)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const thumbnail = await getOrBuildThumbnail(db, id)
      if (!thumbnail) {
        return c.json({ error: 'No posters available for this library' }, 404)
      }

      const etag = `"${Math.trunc(thumbnail.mtimeMs)}"`
      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

      const buffer = await readFile(thumbnail.path)

      return c.body(new Uint8Array(buffer), 200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ETag: etag,
      })
    })
    // .route('/:libraryId/sources', makeSourcesRouter(db))
    .route('/:libraryId/scan', makeScanRouter(db, scannerHandle))

  return router
}

// Route schema for hono/client (RPC) type inference on the web client
export type LibrariesRoutes = ReturnType<typeof makeLibrariesRouter>
