import {
  DataSourceType,
  type Library,
  LibraryType,
  MediaType,
  // MediaCategory,
  // type MediaItem,
  UserRole,
} from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireRole } from '../auth/rbac.ts'
import { appCache, computeETag } from '../cache.ts'
import type { MediaItem } from '../db/schema.ts'
import { validate } from '../http/validate.ts'
import type { ScannerHandle } from '../scanner/scannerHandle.ts'
import * as libraryService from '../services/libraryService.ts'
import { makeLibraryThumbnailRouter } from './libraryThumbnail.ts'
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
  types: z.array(z.enum(LibraryType)),
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
): Hono {
  const router = new Hono()

  router.post(
    '/',
    // requireRole(UserRole.User),
    validate('json', createLibrarySchema),
    async (c) => {
      const body = c.req.valid('json')
      // biome-ignore lint/style/noNonNullAssertion: middleware
      const user = c.get('user')!

      const id = await libraryService.createLibrary(db, {
        ...body,
        userId: user.id,
      })

      appCache.invalidate(LIBRARIES_ALL_KEY)
      const library = await libraryService.getLibraryById(db, id)

      triggerLibraryScan(scannerHandle, id)

      return c.json(library, 201)
    },
  )

  // GET /libraries — list accessible libraries (admin/manager see all; user/guest see granted)
  router.get('/', async (c) => {
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
  router.get('/:id', async (c) => {
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
  router.put(
    '/:id',
    requireRole(UserRole.User),
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
  router.delete('/:id', requireRole(UserRole.User), async (c) => {
    const id = c.req.param('id')
    const result = await libraryService.deleteLibraryById(db, id)

    appCache.invalidate(LIBRARIES_ALL_KEY)

    return c.json({ success: result })
  })

  // GET /libraries/:libraryId/media — list media items with filtering, sorting, pagination
  router.get(
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

  router.route('/', makeLibraryThumbnailRouter(db))
  // router.route('/:libraryId/sources', makeSourcesRouter(db))
  router.route('/:libraryId/scan', makeScanRouter(db, scannerHandle))

  return router
}
