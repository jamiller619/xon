import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { computeETag } from '../../cache.ts'
import {
  errorCodes,
  errorResponse,
  notFound,
  setConditionalCacheHeaders,
} from '../../http/responses.ts'
import { resourceIdParamsSchema } from '../../http/schemas.ts'
import { validate } from '../../http/validate.ts'
import {
  ARTWORK_KINDS,
  appendMatchedPosters,
  generateArtworkBackdrops,
  generateArtworkPosters,
  getArtworkImage,
  getArtworkMediaItem,
  getMediaThumbnail,
  MAX_ARTWORK_UPLOAD_BYTES,
  replaceArtworkImages,
  uploadArtwork,
} from '../../services/mediaArtworkService.ts'

const imageSourceSchema = z.string().trim().min(1).max(8192)
const posterImageSchema = z.union([
  imageSourceSchema,
  z.object({
    src: imageSourceSchema,
    thumbnails: z
      .object({
        small: imageSourceSchema,
        medium: imageSourceSchema,
        large: imageSourceSchema,
      })
      .optional(),
  }),
])
const artworkImagesSchema = z.object({
  poster: z.array(posterImageSchema).max(100),
  backdrop: z.array(imageSourceSchema).max(100),
  logo: z.array(imageSourceSchema).max(100),
})
const thumbnailQuerySchema = z.object({
  size: z.enum(['small', 'medium', 'large']).optional().default('medium'),
  v: z.string().max(100).optional(),
})
const artworkParamsSchema = resourceIdParamsSchema.extend({
  kind: z.enum(ARTWORK_KINDS),
  index: z.coerce.number().int().min(0),
})
const artworkUploadParamsSchema = resourceIdParamsSchema.extend({
  kind: z.enum(ARTWORK_KINDS),
})

export function makeMediaArtworkRouter(db: LibSQLDatabase) {
  return new Hono()
    .get(
      '/:id/thumbnail',
      validate('query', thumbnailQuerySchema),
      async (c) => {
        const id = c.req.param('id')
        const { size } = c.req.valid('query')
        const result = await getMediaThumbnail(db, id, size)
        if (result.status === 'media-not-found') {
          return notFound(c, 'Media item not found')
        }
        if (result.status === 'image-not-found') {
          return notFound(c, 'Media image not found')
        }

        const etag = computeETag([id, result.source, size, result.data.length])
        if (
          setConditionalCacheHeaders(
            c,
            etag,
            'public, max-age=86400, immutable',
          )
        ) {
          return c.body(null, 304)
        }

        return c.body(new Uint8Array(result.data), 200, {
          'Content-Type': result.contentType,
        })
      },
    )
    .get(
      '/:id/images/:kind/:index',
      validate('param', artworkParamsSchema),
      async (c) => {
        const { kind, index } = c.req.valid('param')
        const result = await getArtworkImage(db, c.req.param('id'), kind, index)
        if (result.status === 'media-not-found') {
          return notFound(c, 'Media item not found')
        }
        if (result.status === 'image-not-found') {
          return notFound(c, 'Media image not found')
        }
        if (result.status === 'unsupported') {
          return errorResponse(
            c,
            415,
            errorCodes.unsupportedMediaType,
            'Unsupported image type',
          )
        }
        if (result.status === 'redirect') return c.redirect(result.source, 302)

        const etag = computeETag([result.source, result.data.length])
        if (setConditionalCacheHeaders(c, etag, 'private, no-cache')) {
          return c.body(null, 304)
        }
        return c.body(new Uint8Array(result.data), 200, {
          'Content-Type': result.contentType,
        })
      },
    )
    .put('/:id/images', validate('json', artworkImagesSchema), async (c) => {
      const result = await replaceArtworkImages(
        db,
        c.req.param('id'),
        c.req.valid('json'),
      )
      if (result.status === 'media-not-found') {
        return notFound(c, 'Media item not found')
      }
      return c.json({ images: result.images })
    })
    .post('/:id/images/posters/find', async (c) => {
      const result = await appendMatchedPosters(db, c.req.param('id'))
      if (result.status === 'media-not-found') {
        return notFound(c, 'Media item not found')
      }
      if (result.status === 'unmatched') {
        return errorResponse(
          c,
          409,
          errorCodes.conflict,
          'This title does not have a metadata match',
        )
      }
      if (result.status === 'provider-error') {
        return errorResponse(
          c,
          422,
          errorCodes.unprocessableEntity,
          result.message,
        )
      }
      return c.json({ images: result.images }, 201)
    })
    .post('/:id/images/posters/generate', async (c) => {
      const result = await generateArtworkPosters(db, c.req.param('id'))
      return generatedArtworkResponse(c, result)
    })
    .post('/:id/images/backdrops/generate', async (c) => {
      const result = await generateArtworkBackdrops(db, c.req.param('id'))
      return generatedArtworkResponse(c, result)
    })
    .post(
      '/:id/images/:kind',
      validate('param', artworkUploadParamsSchema),
      async (c) => {
        const item = await getArtworkMediaItem(db, c.req.param('id'))
        if (!item) return notFound(c, 'Media item not found')

        const form = await c.req.parseBody()
        const file = form.file
        if (!(file instanceof File)) {
          return errorResponse(
            c,
            400,
            errorCodes.badRequest,
            'Choose an image to upload',
          )
        }
        if (file.size === 0 || file.size > MAX_ARTWORK_UPLOAD_BYTES) {
          return errorResponse(
            c,
            413,
            errorCodes.payloadTooLarge,
            'Image must be between 1 byte and 20 MB',
          )
        }

        const result = await uploadArtwork(
          db,
          item,
          c.req.valid('param').kind,
          Buffer.from(await file.arrayBuffer()),
        )
        if (result.status === 'unsupported') {
          return errorResponse(
            c,
            415,
            errorCodes.unsupportedMediaType,
            'Upload a JPEG, PNG, WebP, GIF, or AVIF image',
          )
        }
        return c.json({ images: result.images }, 201)
      },
    )
}

function generatedArtworkResponse(
  c: Context,
  result: Awaited<ReturnType<typeof generateArtworkPosters>>,
) {
  if (result.status === 'media-not-found') {
    return notFound(c, 'Media item not found')
  }
  if (result.status === 'not-video') {
    return errorResponse(
      c,
      400,
      errorCodes.badRequest,
      'Images can only be created from video items',
    )
  }
  if (result.status === 'generation-failed') {
    return errorResponse(
      c,
      500,
      errorCodes.internal,
      'Could not create images from this video',
    )
  }
  return c.json({ images: result.images }, 201)
}
