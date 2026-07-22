import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { SortProps } from '@xon/shared'
import { eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { computeETag } from '../cache.ts'
import config from '../config.ts'
import type { MediaItem } from '../db/schema.ts'
import { groupItems, groups, mediaItems } from '../db/schema.ts'
import { validate } from '../http/validate.ts'
import {
  extractFfprobeMetadata,
  extractStreamTracks,
} from '../media/ffprobe.ts'
import { convertRawToJpeg, isRawImage } from '../media/raw.ts'
import {
  generateHlsPlaylist,
  needsTranscoding,
  spawnTranscodeSegment,
} from '../media/transcode.ts'
import * as mediaService from '../services/mediaService.ts'
import {
  applyMatch,
  getMatchContext,
  getMatchProviders,
  searchMatches,
} from '../services/metadataMatchingService.ts'

const mediaListQuerySchema = z.object({
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'scannedAt', 'id'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export function makeMediaRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // GET /media — list media items scoped to accessible libraries
  router.get('/', validate('query', mediaListQuerySchema), async (c) => {
    const user = c.get('user')

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { sortBy, order, page, limit } = c.req.valid('query')
    const pageProps = { pageNumber: page, pageSize: limit }
    const sortProps: SortProps<MediaItem> | undefined = sortBy
      ? { field: sortBy, order }
      : undefined

    const items = await mediaService.getMediaByUser(
      db,
      user.id,
      pageProps,
      sortProps,
    )

    const etag = computeETag(items)
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    c.header('ETag', etag)

    return c.json(items)
  })

  // GET /media/featured — daily-rotating highlights: top-rated items with artwork
  router.get('/featured', async (c) => {
    const user = c.get('user')

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const items = await mediaService.getFeaturedMedia(db, user.id)

    const etag = computeETag(items)
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    c.header('ETag', etag)

    return c.json(items)
  })

  // GET /media/:id — get single media item
  router.get('/:id', async (c) => {
    const id = c.req.param('id')
    const data = await mediaService.getMediaById(db, id)

    if (!data) return c.json({ error: 'Not found' }, 404)
    const etag = `"${data.updatedAt?.getTime()}"`
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
    c.header('ETag', etag)
    // return c.json({ ...itemWithUrls, pluginMetadata })
    return c.json(data)
  })

  const THUMBNAIL_SIZES = new Set(['small', 'medium', 'large'])

  // GET /media/:id/thumbnail?size=small|medium|large — serve a locally
  // generated thumbnail from the cache. Files are named deterministically
  // (<id>_<size>.jpg), so the item id + size is enough to locate them.
  router.get('/:id/thumbnail', async (c) => {
    const id = c.req.param('id')
    const size = c.req.query('size') ?? 'medium'

    // Guard against path traversal — ids are UUIDs.
    if (!/^[a-zA-Z0-9-]+$/.test(id) || !THUMBNAIL_SIZES.has(size)) {
      return c.json({ error: 'Not found' }, 404)
    }

    const filePath = join(
      config.get('appdata.cachePath'),
      'thumbnails',
      `${id}_${size}.jpg`,
    )

    let data: Buffer
    try {
      data = await readFile(filePath)
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }

    const etag = `"${id}-${size}-${data.length}"`
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    return c.body(new Uint8Array(data), 200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      ETag: etag,
    })
  })

  const updateMediaSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })

  // PUT /media/:id — update editable metadata fields
  router.put('/:id', validate('json', updateMediaSchema), async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const updates: Partial<typeof mediaItems.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.tags !== undefined) {
      const meta = item.metadata

      meta.tags = body.tags

      updates.metadata = meta
    }

    await db.update(mediaItems).set(updates).where(eq(mediaItems.id, id))
    const updated = await db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, id))

    return c.json(updated[0] as MediaItem)
  })

  const matchSearchSchema = z.object({
    query: z.string().trim().min(1).max(200),
  })
  const applyMatchSchema = z.object({
    providerId: z.string().min(1).max(200),
    matchId: z.string().min(1).max(200),
  })

  router.get('/:id/match-providers', async (c) => {
    const context = await getMatchContext(db, c.req.param('id'))
    if (!context) return c.json({ error: 'Not found' }, 404)
    return c.json(getMatchProviders(context))
  })

  router.get(
    '/:id/matches',
    validate('query', matchSearchSchema),
    async (c) => {
      const context = await getMatchContext(db, c.req.param('id'))
      if (!context) return c.json({ error: 'Not found' }, 404)
      const { query } = c.req.valid('query')
      return c.json({
        providers: await searchMatches(context, query),
      })
    },
  )

  router.post('/:id/match', validate('json', applyMatchSchema), async (c) => {
    const context = await getMatchContext(db, c.req.param('id'))
    if (!context) return c.json({ error: 'Not found' }, 404)
    const { providerId, matchId } = c.req.valid('json')

    try {
      return c.json(await applyMatch(db, context, providerId, matchId))
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        422,
      )
    }
  })

  const bulkSchema = z.object({
    action: z.enum(['update', 'delete', 'move-to-group']),
    ids: z.array(z.string().min(1)).min(1).max(100),
    updates: z
      .object({
        genre: z.string().optional(),
        tags: z.array(z.string()).optional(),
        contentRating: z.enum(['G', 'PG', 'PG-13', 'R', 'unrated']).optional(),
      })
      .optional(),
    groupId: z.string().optional(),
  })

  // POST /media/bulk — bulk update, delete, or move media items
  router.post('/bulk', validate('json', bulkSchema), async (c) => {
    const body = c.req.valid('json')

    // Fetch requested items (access-check + existence)
    const baseQuery = db
      .select({ id: mediaItems.id, metadata: mediaItems.metadata })
      .from(mediaItems)
      .where(inArray(mediaItems.id, body.ids))
    const rows = await baseQuery
    const foundIds = rows.map((r) => r.id)

    if (foundIds.length === 0) {
      return c.json({ error: 'No matching items found' }, 404)
    }

    if (body.action === 'delete') {
      await db.delete(mediaItems).where(inArray(mediaItems.id, foundIds))
      return c.json({ deleted: foundIds.length })
    }

    if (body.action === 'update') {
      const upd = body.updates ?? {}
      const hasUpdates =
        upd.genre !== undefined ||
        upd.tags !== undefined ||
        upd.contentRating !== undefined
      if (!hasUpdates) return c.json({ error: 'No updates provided' }, 400)

      for (const row of rows) {
        const updates: Partial<typeof mediaItems.$inferInsert> = {
          updatedAt: new Date(),
        }

        if (upd.genre !== undefined || upd.tags !== undefined) {
          const meta = row.metadata

          if (upd.genre !== undefined) meta.genre = upd.genre
          if (upd.tags !== undefined) meta.tags = upd.tags

          updates.metadata = meta
        }

        await db
          .update(mediaItems)
          .set(updates)
          .where(eq(mediaItems.id, row.id))
      }

      return c.json({ updated: foundIds.length })
    }

    // action === "move-to-group"
    if (!body.groupId)
      return c.json({ error: 'groupId required for move-to-group' }, 400)

    const groupRows = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, body.groupId))
    if (!groupRows[0]) return c.json({ error: 'Group not found' }, 404)

    for (const id of foundIds) {
      await db
        .insert(groupItems)
        .values({ groupId: body.groupId, mediaItemId: id, sortOrder: 0 })
        .onConflictDoNothing()
    }

    return c.json({ moved: foundIds.length })
  })

  // GET /media/:id/stream — serve media file with HTTP range request support
  router.get('/:id/stream', async (c) => {
    const id = c.req.param('id')
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    // RAW camera images: convert to JPEG on-the-fly via dcraw
    if (isRawImage(item.filePath)) {
      let jpegBuffer: Buffer
      try {
        jpegBuffer = await convertRawToJpeg(item.filePath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'RAW conversion failed'
        return c.json({ error: msg }, 500)
      }
      return c.body(new Uint8Array(jpegBuffer), 200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      })
    }

    // Check if format needs transcoding — if so, redirect to HLS playlist
    const meta = await extractFfprobeMetadata(item.filePath)
    if (meta && needsTranscoding(meta.codec, meta.audioCodec)) {
      return c.redirect(`/api/media/${id}/hls/playlist.m3u8`, 307)
    }

    const range = c.req.header('Range')

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range)
      if (!match) return c.json({ error: 'Invalid range' }, 400)
      const start = Number.parseInt(match[1] ?? '0', 10)
      const end = match[2] ? Number.parseInt(match[2], 10) : item.fileSize - 1

      if (start > end || end >= item.fileSize) {
        return c.body(null, 416, {
          'Content-Range': `bytes */${item.fileSize}`,
        })
      }

      const chunkSize = end - start + 1
      const nodeStream = createReadStream(item.filePath, { start, end })
      const webStream = Readable.toWeb(nodeStream) as ReadableStream

      return c.body(webStream, 206, {
        'Content-Range': `bytes ${start}-${end}/${item.fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': item.mediaType,
      })
    }

    const nodeStream = createReadStream(item.filePath)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return c.body(webStream, 200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(item.fileSize),
      'Content-Type': item.mediaType,
    })
  })

  const HLS_SEGMENT_DURATION = 6

  // GET /media/:id/hls/playlist.m3u8 — generate HLS playlist for transcoded playback
  router.get('/:id/hls/playlist.m3u8', async (c) => {
    const id = c.req.param('id')
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const duration = item.metadata?.duration

    if (!duration)
      return c.json({ error: 'Cannot determine media duration' }, 422)

    const playlist = generateHlsPlaylist(
      item.metadata.duration,
      HLS_SEGMENT_DURATION,
    )
    return c.text(playlist, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    })
  })

  // GET /media/:id/hls/:segment — transcode and serve a specific HLS segment on-the-fly
  router.get('/:id/hls/:segment', async (c) => {
    const id = c.req.param('id')
    const segment = c.req.param('segment')

    // Validate segment name: segment-N.ts
    const match = /^segment-(\d+)\.ts$/.exec(segment)
    if (!match) return c.json({ error: 'Invalid segment name' }, 400)
    const segmentIndex = Number.parseInt(match[1] ?? '0', 10)

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const proc = spawnTranscodeSegment(
      item.filePath,
      segmentIndex,
      HLS_SEGMENT_DURATION,
    )

    const stream = new ReadableStream({
      start(controller) {
        proc.stdout?.on('data', (chunk: Buffer) => controller.enqueue(chunk))
        proc.stdout?.on('end', () => controller.close())
        proc.stdout?.on('error', (err: Error) => controller.error(err))
        proc.on('error', (err: Error) => controller.error(err))
      },
      cancel() {
        proc.kill()
      },
    })

    return c.body(stream, 200, {
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'public, max-age=3600',
    })
  })

  // GET /media/:id/tracks — list audio and subtitle tracks (embedded + external)
  router.get('/:id/tracks', async (c) => {
    const id = c.req.param('id')
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const allTracks = await extractStreamTracks(item.filePath)
    const audioTracks = allTracks
      .filter((t) => t.codecType === 'audio')
      .map((t) => ({
        index: t.index,
        codec: t.codec,
        language: t.language,
        title: t.title,
      }))
    const embeddedSubs = allTracks
      .filter((t) => t.codecType === 'subtitle')
      .map((t) => ({
        type: 'embedded' as const,
        index: t.index,
        codec: t.codec,
        language: t.language,
        title: t.title,
        label: t.title ?? t.language ?? `Track ${t.index}`,
      }))

    const dir = dirname(item.filePath)
    const base = basename(item.filePath, extname(item.filePath))
    let externalSubs: {
      type: 'external'
      file: string
      language?: string
      label: string
    }[] = []

    try {
      const entries = await readdir(dir)
      externalSubs = entries
        .filter((f) => {
          const ext = extname(f).toLowerCase()
          return (ext === '.srt' || ext === '.vtt') && f.startsWith(base)
        })
        .map((f) => {
          // Try to extract language code from filename like "movie.en.srt" or "movie.en.US.srt"
          const withoutExt = basename(f, extname(f))
          const suffix = withoutExt.slice(base.length).replace(/^\./, '')
          const language = suffix || undefined
          return {
            type: 'external' as const,
            file: f,
            ...(language ? { language } : {}),
            label: language
              ? `${language.toUpperCase()} (external)`
              : `External (${extname(f).slice(1).toUpperCase()})`,
          }
        })
    } catch {
      // directory not readable — return empty external list
    }

    return c.json({
      audioTracks,
      subtitleTracks: [...embeddedSubs, ...externalSubs],
    })
  })

  // GET /media/:id/subtitle?file=filename.srt — serve an external subtitle file
  router.get('/:id/subtitle', async (c) => {
    const id = c.req.param('id')
    const file = c.req.query('file')

    if (!file) return c.json({ error: 'Missing file parameter' }, 400)
    // Security: reject path traversal and ensure valid extension
    if (file.includes('/') || file.includes('\\') || file.includes('..')) {
      return c.json({ error: 'Invalid file parameter' }, 400)
    }
    const ext = extname(file).toLowerCase()
    if (ext !== '.srt' && ext !== '.vtt') {
      return c.json(
        { error: 'Only .srt and .vtt subtitle files are supported' },
        400,
      )
    }

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const subtitlePath = join(dirname(item.filePath), file)
    let content: Buffer
    try {
      content = await readFile(subtitlePath)
    } catch {
      return c.json({ error: 'Subtitle file not found' }, 404)
    }

    // Serve as WebVTT; add WEBVTT header for .srt files for browser compatibility
    let body = content.toString('utf-8')
    if (ext === '.srt' && !body.startsWith('WEBVTT')) {
      body = `WEBVTT\n\n${body}`
    }

    return c.text(body, 200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    })
  })

  return router
}
