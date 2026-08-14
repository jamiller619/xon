import { readFile } from 'node:fs/promises'
import {
  type ContentType,
  DataSourceType,
  type Library,
  MediaType,
} from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { fileTypeFromBuffer } from 'file-type'
import { Hono } from 'hono'
import { z } from 'zod'
import { appCache, computeETag } from '../cache.ts'
import { requireAuth } from '../http/authMiddleware.js'
import { validate } from '../http/validate.ts'
import { resolveLocalArtworkPath } from '../media/cachePaths.ts'
import type { ScannerHandle } from '../scanner/scannerHandle.ts'
import * as libraryService from '../services/libraryService.ts'
import {
  generateLibraryPoster,
  getOrBuildThumbnail,
  removeLibraryPoster,
  storeUploadedLibraryPoster,
} from '../services/libraryThumbnailService.ts'
import { makeScanRouter, triggerLibraryScan } from './scan.ts'

const LIBRARIES_ALL_KEY = 'libraries:all'
const MAX_LIBRARY_IMAGE_BYTES = 20 * 1024 * 1024
const SUPPORTED_LIBRARY_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const libraryImagesSchema = z.object({
  poster: z.array(z.string().trim().min(1).max(8192)).max(100),
})

const libraryMediaQuerySchema = z.object({
  mediaType: z.enum(MediaType.MainType).optional(),
  unmatched: z.stringbool().optional().default(false),
  sortBy: z.enum(['title', 'fileSize', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

const createLibrarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string<ContentType>(),
  scanSchedule: z.string().optional(),
  dataSources: z.array(
    z.object({
      id: z.string().min(1).optional(),
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
        id: z.string().min(1).optional(),
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
      requireAuth,
      validate('json', createLibrarySchema),
      async (c) => {
        const body = c.req.valid('json')
        const user = c.get('user')

        const id = await libraryService.createLibrary(db, {
          ...body,
          dataSources: body.dataSources.map((source) => ({
            ...source,
            id: source.id ?? crypto.randomUUID(),
          })),
          ownerId: user.id,
        })

        appCache.invalidate(LIBRARIES_ALL_KEY)
        const library = await libraryService.getLibraryById(db, id)

        triggerLibraryScan(scannerHandle, id)

        return c.json(library, 201)
      },
    )

    // GET /libraries — list accessible libraries
    .get('/', requireAuth, async (c) => {
      const user = c.get('user')
      const libraries = await libraryService.getLibrariesByUserId(db, user.id)

      const etag = computeETag(libraries)
      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
      c.header('ETag', etag)

      return c.json(libraries)
    })

    // GET /libraries/:id — get single library
    .get('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const library = await libraryService.getLibraryById(db, id)

      if (library == null) return c.json({ error: 'Not found' }, 404)

      const etag = computeETag(library)

      if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
      c.header('ETag', etag)

      return c.json(library)
    })

    // PUT /libraries/:id — update library
    .put(
      '/:id',
      requireAuth,
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
        if (body.dataSources != null) {
          updates.dataSources = body.dataSources.map((source, index) => {
            const prior = source.id
              ? existing.dataSources.find((item) => item.id === source.id)
              : (existing.dataSources.find(
                  (item) =>
                    item.type === source.type &&
                    item.path === source.path &&
                    item.pluginId === source.pluginId,
                ) ?? existing.dataSources[index])
            return {
              ...prior,
              ...source,
              id: source.id ?? prior?.id ?? crypto.randomUUID(),
              path: source.path ?? prior?.path ?? '',
              type: source.type ?? prior?.type ?? DataSourceType.local,
            }
          })
        }

        const updated = await libraryService.updateLibrary(db, id, updates)

        appCache.invalidate(LIBRARIES_ALL_KEY)

        return c.json(updated)
      },
    )

    // DELETE /libraries/:id — delete library
    .delete('/:id', requireAuth, async (c) => {
      const id = c.req.param('id')
      const result = await libraryService.deleteLibraryById(db, id)

      appCache.invalidate(LIBRARIES_ALL_KEY)

      return c.json({ success: result })
    })

    // GET /libraries/:libraryId/stats — aggregate library-wide media totals
    .get('/:libraryId/stats', async (c) => {
      const libraryId = c.req.param('libraryId')
      const library = await libraryService.getLibraryById(db, libraryId)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const stats = await libraryService.getLibraryStats(db, libraryId)
      return c.json(stats)
    })

    // GET /libraries/:libraryId/media — list media items with filtering, sorting, pagination
    .get(
      '/:libraryId/media',
      requireAuth,
      validate('query', libraryMediaQuerySchema),
      async (c) => {
        const libraryId = c.req.param('libraryId') as string
        const { mediaType, unmatched, sortBy, order, page, limit } =
          c.req.valid('query')
        const library = await libraryService.getLibraryById(db, libraryId)

        if (!library) return c.json({ error: 'Not found' }, 404)
        const pageProps = {
          pageNumber: page,
          pageSize: limit,
        }

        const sortProps = {
          field: sortBy,
          order,
        }

        const results = await libraryService.getMediaByLibraryId(
          db,
          libraryId,
          pageProps,
          sortProps,
          mediaType,
          unmatched,
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

    // Library artwork is stored as an ordered poster collection. The first
    // poster is used by the thumbnail route below.
    .get('/:id/images/poster/:index', async (c) => {
      const id = c.req.param('id')
      const index = Number(c.req.param('index'))
      if (!Number.isInteger(index) || index < 0) {
        return c.json({ error: 'Unknown image' }, 404)
      }

      const library = await libraryService.getLibraryById(db, id)
      const source = library?.images.poster[index]
      if (!source) return c.json({ error: 'Unknown image' }, 404)

      try {
        const filePath = resolveLocalArtworkPath(source)
        if (!filePath) return c.json({ error: 'Image not found' }, 404)
        const data = await readFile(filePath)
        const detected = await fileTypeFromBuffer(data)
        if (!detected || !SUPPORTED_LIBRARY_IMAGE_TYPES.has(detected.mime)) {
          return c.json({ error: 'Unsupported image' }, 415)
        }
        return c.body(new Uint8Array(data), 200, {
          'Content-Type': detected.mime,
          'Cache-Control': 'private, no-cache',
        })
      } catch {
        return c.json({ error: 'Image not found' }, 404)
      }
    })
    .put('/:id/images', validate('json', libraryImagesSchema), async (c) => {
      const id = c.req.param('id')
      const images = c.req.valid('json')
      const library = await libraryService.getLibraryById(db, id)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const existing = new Set(library.images.poster)
      if (images.poster.some((source) => !existing.has(source))) {
        return c.json({ error: 'Images can only be reordered or removed' }, 400)
      }

      await libraryService.updateLibrary(db, id, {
        images,
        updatedAt: new Date(),
      })
      appCache.invalidate(LIBRARIES_ALL_KEY)

      const retained = new Set(images.poster)
      await Promise.all(
        library.images.poster
          .filter((source) => !retained.has(source))
          .map((source) => removeLibraryPoster(id, source)),
      )
      return c.json({ images })
    })
    .post('/:id/images/poster', async (c) => {
      const id = c.req.param('id')
      const library = await libraryService.getLibraryById(db, id)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const form = await c.req.parseBody()
      const file = form.file
      if (!(file instanceof File)) {
        return c.json({ error: 'Choose an image to upload' }, 400)
      }
      if (file.size === 0 || file.size > MAX_LIBRARY_IMAGE_BYTES) {
        return c.json({ error: 'Image must be between 1 byte and 20 MB' }, 413)
      }

      const data = Buffer.from(await file.arrayBuffer())
      const detected = await fileTypeFromBuffer(data)
      if (!detected || !SUPPORTED_LIBRARY_IMAGE_TYPES.has(detected.mime)) {
        return c.json(
          { error: 'Upload a JPEG, PNG, WebP, GIF, or AVIF image' },
          415,
        )
      }

      const source = await storeUploadedLibraryPoster(id, data, detected.ext)
      const images = {
        poster: [...library.images.poster, source],
      }
      try {
        await libraryService.updateLibrary(db, id, {
          images,
          updatedAt: new Date(),
        })
      } catch (error) {
        await removeLibraryPoster(id, source)
        throw error
      }
      appCache.invalidate(LIBRARIES_ALL_KEY)
      return c.json({ images }, 201)
    })
    .post('/:id/images/posters/generate', async (c) => {
      const id = c.req.param('id')
      const library = await libraryService.getLibraryById(db, id)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const source = await generateLibraryPoster(db, id)
      if (!source) {
        return c.json(
          { error: 'No media posters are available to create an image' },
          422,
        )
      }

      const images = {
        poster: [...library.images.poster, source],
      }
      try {
        await libraryService.updateLibrary(db, id, {
          images,
          updatedAt: new Date(),
        })
      } catch (error) {
        await removeLibraryPoster(id, source)
        throw error
      }
      appCache.invalidate(LIBRARIES_ALL_KEY)
      return c.json({ images }, 201)
    })
    // GET /libraries/:id/thumbnail — use the selected library poster, falling
    // back to the cached poster grid built from library media.
    .get('/:id/thumbnail', async (c) => {
      const id = c.req.param('id')

      const library = await libraryService.getLibraryById(db, id)
      if (!library) return c.json({ error: 'Not found' }, 404)

      const selectedPoster = library.images.poster[0]
      if (selectedPoster) {
        try {
          const selectedPosterPath = resolveLocalArtworkPath(selectedPoster)
          if (!selectedPosterPath)
            throw new Error('Invalid library artwork path')
          const buffer = await readFile(selectedPosterPath)
          const detected = await fileTypeFromBuffer(buffer)
          if (detected && SUPPORTED_LIBRARY_IMAGE_TYPES.has(detected.mime)) {
            return c.body(new Uint8Array(buffer), 200, {
              'Content-Type': detected.mime,
              'Cache-Control': 'private, no-cache',
            })
          }
        } catch {
          // Fall back to the generated poster grid below.
        }
      }

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
    .route('/:libraryId/scan', makeScanRouter(db, scannerHandle))

  return router
}

// Route schema for hono/client (RPC) type inference on the web client
export type LibrariesRoutes = ReturnType<typeof makeLibrariesRouter>
