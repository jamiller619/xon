import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { errorCodes, errorResponse, notFound } from '../../http/responses.ts'
import { resourceIdParamsSchema } from '../../http/schemas.ts'
import { validate } from '../../http/validate.ts'
import {
  getMediaHlsPlaylist,
  getMediaStreamDecision,
  getMediaTracks,
  loadMediaSubtitle,
  startMediaHlsSegment,
} from '../../services/mediaStreamingService.ts'

const streamQuerySchema = z.object({
  client: z.string().trim().min(1).max(100).optional(),
})
const subtitleQuerySchema = z.object({
  file: z.string().trim().min(1).max(8192),
})
const hlsSegmentParamsSchema = resourceIdParamsSchema.extend({
  segment: z.string().regex(/^segment-\d+\.ts$/),
})

export function makeMediaStreamingRouter(db: LibSQLDatabase) {
  return new Hono()
    .get('/:id/stream', validate('query', streamQuerySchema), async (c) => {
      const id = c.req.param('id')
      const result = await getMediaStreamDecision(
        db,
        id,
        c.req.valid('query').client,
      )
      if (result.status === 'media-not-found') {
        return notFound(c, 'Media item not found')
      }
      if (result.status === 'raw-error') {
        return errorResponse(c, 500, errorCodes.internal, result.message)
      }
      if (result.status === 'raw') {
        return c.body(new Uint8Array(result.data), 200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        })
      }
      if (result.status === 'hls') {
        return c.redirect(`/api/media/${id}/hls/playlist.m3u8`, 307)
      }

      const range = c.req.header('Range')
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range)
        if (!match) {
          return errorResponse(c, 400, errorCodes.badRequest, 'Invalid range')
        }
        const start = Number.parseInt(match[1] ?? '0', 10)
        const end = match[2]
          ? Number.parseInt(match[2], 10)
          : result.item.fileSize - 1

        if (start > end || end >= result.item.fileSize) {
          c.header('Content-Range', `bytes */${result.item.fileSize}`)
          return errorResponse(
            c,
            416,
            errorCodes.badRequest,
            'Requested range is not satisfiable',
          )
        }

        const nodeStream = createReadStream(result.sourcePath, { start, end })
        return c.body(Readable.toWeb(nodeStream) as ReadableStream, 206, {
          'Content-Range': `bytes ${start}-${end}/${result.item.fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': result.item.mediaType,
        })
      }

      const nodeStream = createReadStream(result.sourcePath)
      return c.body(Readable.toWeb(nodeStream) as ReadableStream, 200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(result.item.fileSize),
        'Content-Type': result.item.mediaType,
      })
    })
    .get('/:id/hls/playlist.m3u8', async (c) => {
      const result = await getMediaHlsPlaylist(db, c.req.param('id'))
      if (result.status === 'media-not-found') {
        return notFound(c, 'Media item not found')
      }
      if (result.status === 'duration-unavailable') {
        return errorResponse(
          c,
          422,
          errorCodes.unprocessableEntity,
          'Cannot determine media duration',
        )
      }
      return c.text(result.playlist, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      })
    })
    .get(
      '/:id/hls/:segment',
      validate('param', hlsSegmentParamsSchema),
      async (c) => {
        const match = /^segment-(\d+)\.ts$/.exec(c.req.valid('param').segment)
        const result = await startMediaHlsSegment(
          db,
          c.req.param('id'),
          Number.parseInt(match?.[1] ?? '0', 10),
        )
        if (result.status === 'media-not-found') {
          return notFound(c, 'Media item not found')
        }

        const proc = result.process
        if (!proc.stdout) {
          proc.kill()
          return errorResponse(
            c,
            500,
            errorCodes.internal,
            'Transcoder output is unavailable',
          )
        }

        const stream = Readable.toWeb(proc.stdout) as ReadableStream
        const abortTranscode = () => {
          if (proc.exitCode === null && !proc.killed) proc.kill()
        }
        const failStream = (error: Error) => proc.stdout?.destroy(error)
        c.req.raw.signal.addEventListener('abort', abortTranscode, {
          once: true,
        })
        proc.once('error', failStream)
        proc.stdout.once('close', () => {
          if (!proc.stdout?.readableEnded) abortTranscode()
        })
        proc.once('close', () => {
          c.req.raw.signal.removeEventListener('abort', abortTranscode)
          proc.removeListener('error', failStream)
        })

        return c.body(stream, 200, {
          'Content-Type': 'video/mp2t',
          'Cache-Control': 'public, max-age=3600',
        })
      },
    )
    .get('/:id/tracks', async (c) => {
      const tracks = await getMediaTracks(db, c.req.param('id'))
      if (!tracks) return notFound(c, 'Media item not found')
      return c.json(tracks)
    })
    .get('/:id/subtitle', validate('query', subtitleQuerySchema), async (c) => {
      const result = await loadMediaSubtitle(
        db,
        c.req.param('id'),
        c.req.valid('query').file,
      )
      if (result.status === 'invalid-file') {
        return errorResponse(
          c,
          400,
          errorCodes.badRequest,
          'Invalid file parameter',
        )
      }
      if (result.status === 'unsupported-file') {
        return errorResponse(
          c,
          400,
          errorCodes.badRequest,
          'Only .srt and .vtt subtitle files are supported',
        )
      }
      if (result.status === 'media-not-found') {
        return notFound(c, 'Media item not found')
      }
      if (result.status === 'subtitle-not-found') {
        return notFound(c, 'Subtitle file not found')
      }
      return c.text(result.body, 200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      })
    })
}
