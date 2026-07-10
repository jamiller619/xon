import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import TmdbMetadataPlugin from '@xon/plugin-tmdb-metadata'
import type { GroupType } from '@xon/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
// import { parse as parseFont } from 'opentype.js'
import { z } from 'zod'
import { computeETag } from '../cache.ts'
import type { MediaItem } from '../db/schema.ts'
import {
  // getAllowedRatings,
  groupItems,
  groups,
  // libraryAccess,
  // matchingQueue,
  mediaItems,
  // mediaProgress,
  // readingPositions,
  users,
} from '../db/schema.ts'
import { validate } from '../http/validate.ts'
import { listArchiveContents } from '../media/archive.ts'
import {
  extractFfprobeMetadata,
  extractStreamTracks,
} from '../media/ffprobe.ts'
import { convertMobiToEpub } from '../media/mobi.ts'
import { convertRawToJpeg, isRawImage } from '../media/raw.ts'
import {
  generateHlsPlaylist,
  needsTranscoding,
  spawnTranscodeSegment,
} from '../media/transcode.ts'
import { getPluginMetadataForItem } from '../plugins/pluginManager.ts'
import * as mediaService from '../services/mediaService.ts'

const tmdbPlugin = new TmdbMetadataPlugin()

const VALID_SIZES = ['small', 'medium', 'large'] as const
type ThumbnailSize = (typeof VALID_SIZES)[number]

// export function withThumbnailUrls(item: MediaItem) {
//   const thumbnailUrls = item.thumbnailPaths
//     ? {
//         small: `/api/media/${item.id}/thumbnail?size=small`,
//         medium: `/api/media/${item.id}/thumbnail?size=medium`,
//         large: `/api/media/${item.id}/thumbnail?size=large`,
//       }
//     : null
//   return { ...item, thumbnailUrls }
// }

export function makeMediaRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // const PRIVILEGED_ROLES = ['admin', 'manager'] as const

  // async function getAccessibleLibraryIds(
  //   userId: string,
  //   role: string,
  // ): Promise<string[] | null> {
  //   if ((PRIVILEGED_ROLES as readonly string[]).includes(role)) return null // null = all
  //   const rows = await db
  //     .select({ libraryId: libraryAccess.libraryId })
  //     .from(libraryAccess)
  //     .where(eq(libraryAccess.userId, userId))
  //   return rows.map((r) => r.libraryId)
  // }

  /** Builds a Drizzle WHERE condition restricting items by the user's maxContentRating. */
  // async function getContentRatingCondition(userId: string) {
  //   const userRows = await db
  //     .select({ maxContentRating: users.maxContentRating })
  //     .from(users)
  //     .where(eq(users.id, userId))
  //   const maxRating = userRows[0]?.maxContentRating ?? 'none'
  //   const allowed = getAllowedRatings(maxRating)
  //   if (allowed === null) return null // no restriction
  //   if (allowed.length === 0) {
  //     // Only unrated items with null contentRating are visible
  //     return isNull(mediaItems.contentRating)
  //   }
  //   // Items with null contentRating are treated as unrated; include them if "unrated" is allowed
  //   const unratedAllowed = (allowed as string[]).includes('unrated')
  //   if (unratedAllowed) {
  //     return or(
  //       isNull(mediaItems.contentRating),
  //       inArray(mediaItems.contentRating, allowed),
  //     ) as SQL<unknown>
  //   }
  //   return inArray(mediaItems.contentRating, allowed)
  // }

  // GET /media — list media items scoped to accessible libraries
  router.get('/', async (c) => {
    const user = c.get('user')

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const { sortBy, order, page, limit } = c.req.query()
    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const offset = (pageNum - 1) * limitNum

    const sortDir = order === 'asc' ? asc : desc
    const orderExpr = sortDir(mediaItems[(sortBy as keyof MediaItem) || 'id'])

    const items = await mediaService.getMediaByUser(db, user.id)

    // const items = await db
    //   .select()
    //   .from(mediaItems)
    //   .orderBy(orderExpr)
    //   .limit(limitNum)
    //   .offset(offset)

    const etag = computeETag(items)
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    c.header('ETag', etag)

    return c.json(items)
    // const orderExpr =
    //   sortBy === 'title'
    //     ? sortDir(mediaItems.title)
    //     : sortBy === 'fileSize'
    //       ? sortDir(mediaItems.fileSize)
    //       : sortDir(mediaItems.createdAt)

    // const accessibleIds = await getAccessibleLibraryIds(user.id, user.role)
    // if (accessibleIds !== null && accessibleIds.length === 0) {
    //   return c.json([])
    // }

    // const ratingCond = await getContentRatingCondition(user.id)

    // const libraryFilter =
    // accessibleIds !== null
    // ? inArray(mediaItems.libraryId, accessibleIds)
    // : undefined
    // const whereClause = and(libraryFilter, ratingCond ?? undefined)
    // const whereClause = and(libraryFilter, undefined)

    // const baseQuery = db.select().from(mediaItems)
    // const scopedQuery = whereClause ? baseQuery.where(whereClause) : baseQuery
    // const rows = await scopedQuery
    //   .orderBy(orderExpr)
    //   .limit(limitNum)
    //   .offset(offset)

    // const items = rows.map(withThumbnailUrls)
    // const items = rows
    // const etag = computeETag(items)
    // if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
    // c.header('ETag', etag)
    // return c.json(items)
  })

  // GET /media/:id — get single media item (scoped to accessible libraries)
  router.get('/:id', async (c) => {
    const id = c.req.param('id')
    // const user = c.get('user')
    const data = await mediaService.getMediaById(db, id)

    if (!data) return c.json({ error: 'Not found' }, 404)

    // const accessibleIds = await getAccessibleLibraryIds(user.id, user.role)
    // if (accessibleIds !== null && !accessibleIds.includes(item.libraryId)) {
    //   return c.json({ error: 'Not found' }, 404)
    // }

    // const ratingCond = await getContentRatingCondition(user.id)
    // if (ratingCond !== null) {
    //   // Check if this item passes the content rating filter
    //   const allowed = await db
    //     .select({ id: mediaItems.id })
    //     .from(mediaItems)
    //     .where(and(eq(mediaItems.id, id), ratingCond))
    //   if (allowed.length === 0) return c.json({ error: 'Not found' }, 404)
    // }

    // const itemWithUrls = withThumbnailUrls(item)
    // const pluginMetadata = await getPluginMetadataForItem(id)
    const etag = `"${data.updatedAt?.getTime()}"`
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
    c.header('ETag', etag)
    // return c.json({ ...itemWithUrls, pluginMetadata })
    return c.json(data)
  })

  // GET /media/:id/match — get pending match for a media item
  // router.get('/:id/match', async (c) => {
  //   const id = c.req.param('id')
  //   // const user = c.get('user')

  //   const rows = await db
  //     .select({ libraryId: mediaItems.libraryId })
  //     .from(mediaItems)
  //     .where(eq(mediaItems.id, id))
  //   const item = rows[0]
  //   if (!item) return c.json({ error: 'Not found' }, 404)

  //   // const accessibleIds = await getAccessibleLibraryIds(user.id, user.role)
  //   // if (accessibleIds !== null && !accessibleIds.includes(item.libraryId)) {
  //   //   return c.json({ error: 'Not found' }, 404)
  //   // }

  //   const matchRows = await db
  //     .select()
  //     .from(matchingQueue)
  //     .where(
  //       and(
  //         eq(matchingQueue.mediaItemId, id),
  //         eq(matchingQueue.status, 'pending'),
  //       ),
  //     )
  //     .limit(1)

  //   const match = matchRows[0]
  //   if (!match) return c.json(null)

  //   return c.json({
  //     ...match,
  //     suggestedMetadata: (() => {
  //       try {
  //         return JSON.parse(match.suggestedMetadata) as Record<string, unknown>
  //       } catch {
  //         return {}
  //       }
  //     })(),
  //   })
  // })

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
    // return c.json(withThumbnailUrls(updated[0] as
    // MediaItem))

    return c.json(updated[0] as MediaItem)
  })

  const aiTagsSchema = z.object({
    accept: z.array(z.string()).optional(),
    reject: z.array(z.string()).optional(),
  })

  // PUT /media/:id/ai-tags — accept or reject AI-generated tag suggestions
  router.put('/:id/ai-tags', validate('json', aiTagsSchema), async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const meta = item.metadata

    interface AiTagEntry {
      text: string
      confidence: number
      source: string
    }

    const currentAiTags: AiTagEntry[] = Array.isArray(meta.aiTags)
      ? (meta.aiTags as AiTagEntry[])
      : []
    const currentTags: string[] = Array.isArray(meta.tags)
      ? (meta.tags as string[])
      : []

    const acceptSet = new Set(body.accept ?? [])
    const rejectSet = new Set(body.reject ?? [])

    // Move accepted tags into the regular tags array
    const newTags = [...currentTags]
    for (const tag of currentAiTags) {
      if (acceptSet.has(tag.text) && !newTags.includes(tag.text)) {
        newTags.push(tag.text)
      }
    }

    // Remove accepted and rejected from aiTags
    const remainingAiTags = currentAiTags.filter(
      (t) => !acceptSet.has(t.text) && !rejectSet.has(t.text),
    )

    meta.tags = newTags
    meta.aiTags = remainingAiTags

    await db
      .update(mediaItems)
      .set({ metadata: meta, updatedAt: new Date() })
      .where(eq(mediaItems.id, id))

    const updated = await db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, id))
    // return c.json(withThumbnailUrls(updated[0] as
    // MediaItem))

    return c.json(updated[0] as MediaItem)
  })

  router.get('/find-match', async (c) => {
    const title = c.req.query('title')

    if (!title) return c.json({ error: 'Missing title' }, 400)

    const year = c.req.query('year')
    const results = await tmdbPlugin.findMatch(title, year)

    return c.json(results)
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
    const user = c.get('user')

    // Scope to accessible libraries
    // const accessibleIds = await getAccessibleLibraryIds(user.id, user.role)
    // if (accessibleIds !== null && accessibleIds.length === 0) {
    //   return c.json({ error: 'No accessible libraries' }, 403)
    // }

    // const libraryFilter =
    //   accessibleIds !== null
    //     ? inArray(mediaItems.libraryId, accessibleIds)
    //     : undefined

    // Fetch requested items (access-check + existence)
    const baseQuery = db
      .select({ id: mediaItems.id, metadata: mediaItems.metadata })
      .from(mediaItems)
      .where(
        // libraryFilter
        //   ? and(inArray(mediaItems.id, body.ids), libraryFilter)
        // :
        inArray(mediaItems.id, body.ids),
      )
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

        // if (upd.contentRating !== undefined) {
        //   updates.contentRating = upd.contentRating
        // }

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

  // GET /media/:id/thumbnail?size=small|medium|large
  // router.get('/:id/thumbnail', async (c) => {
  //   const id = c.req.param('id')
  //   const sizeParam = c.req.query('size') ?? 'medium'

  //   if (!VALID_SIZES.includes(sizeParam as ThumbnailSize)) {
  //     return c.json(
  //       { error: 'Invalid size. Must be small, medium, or large.' },
  //       400,
  //     )
  //   }
  //   const size = sizeParam as ThumbnailSize

  //   const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  //   const item = rows[0]
  //   if (!item) return c.json({ error: 'Not found' }, 404)
  //   if (!item.thumbnailPaths)
  //     return c.json({ error: 'No thumbnail available' }, 404)

  //   let paths: ThumbnailPaths
  //   try {
  //     paths = JSON.parse(item.thumbnailPaths) as ThumbnailPaths
  //   } catch {
  //     return c.json({ error: 'No thumbnail available' }, 404)
  //   }

  //   const filePath = paths[size]
  //   if (!filePath) return c.json({ error: 'No thumbnail available' }, 404)

  //   let buffer: Buffer
  //   try {
  //     buffer = await readFile(filePath)
  //   } catch {
  //     return c.json({ error: 'No thumbnail available' }, 404)
  //   }

  //   return c.body(new Uint8Array(buffer), 200, {
  //     'Content-Type': 'image/jpeg',
  //     'Cache-Control': 'public, max-age=86400, immutable',
  //   })
  // })

  // GET /media/:id/epub — serve EPUB file (or convert MOBI to EPUB)
  router.get('/:id/epub', async (c) => {
    const id = c.req.param('id')
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const ext = extname(item.filePath).toLowerCase()
    if (
      ext !== '.epub' &&
      ext !== '.mobi' &&
      ext !== '.azw' &&
      ext !== '.azw3'
    ) {
      return c.json({ error: 'Not an EPUB or MOBI file' }, 400)
    }

    let epubPath = item.filePath

    if (ext !== '.epub') {
      // Convert MOBI/AZW to EPUB via ebook-convert (calibre)
      let converted: string
      try {
        converted = await convertMobiToEpub(item.filePath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Conversion failed'
        return c.json({ error: msg }, 500)
      }
      epubPath = converted
    }

    let buffer: Buffer
    try {
      buffer = await readFile(epubPath)
    } catch {
      return c.json({ error: 'File not accessible' }, 404)
    }

    return c.body(new Uint8Array(buffer), 200, {
      'Content-Type': 'application/epub+zip',
      'Cache-Control': 'no-store',
    })
  })

  // GET /media/:id/font-metadata — parse font file and return name/weight/style/glyph count
  // router.get('/:id/font-metadata', async (c) => {
  //   const id = c.req.param('id')
  //   const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  //   const item = rows[0]
  //   if (!item) return c.json({ error: 'Not found' }, 404)

  //   const ext = extname(item.filePath).toLowerCase()
  //   const fontExts = ['.ttf', '.otf', '.woff', '.woff2', '.eot']
  //   if (!fontExts.includes(ext)) {
  //     return c.json({ error: 'Not a font file' }, 400)
  //   }

  //   let buffer: Buffer
  //   try {
  //     buffer = await readFile(item.filePath)
  //   } catch {
  //     return c.json({ error: 'File not accessible' }, 404)
  //   }

  //   try {
  //     const font = parseFont(buffer.buffer as ArrayBuffer)
  //     const names = font.names
  //     const family =
  //       names.fontFamily?.en ??
  //       Object.values(names.fontFamily ?? {})[0] ??
  //       basename(item.filePath, ext)
  //     const subfamily =
  //       names.fontSubfamily?.en ??
  //       Object.values(names.fontSubfamily ?? {})[0] ??
  //       'Regular'
  //     const glyphCount = font.glyphs.length
  //     const unitsPerEm = font.unitsPerEm
  //     return c.json({ family, subfamily, glyphCount, unitsPerEm })
  //   } catch {
  //     // WOFF2 or unsupported format — return what we can from the filename
  //     const family = basename(item.filePath, ext)
  //     return c.json({
  //       family,
  //       subfamily: 'Unknown',
  //       glyphCount: null,
  //       unitsPerEm: null,
  //     })
  //   }
  // })

  // GET /media/:id/archive-contents — list files inside a ZIP, TAR, or 7z archive
  // router.get('/:id/archive-contents', async (c) => {
  //   const id = c.req.param('id')
  //   const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  //   const item = rows[0]
  //   if (!item) return c.json({ error: 'Not found' }, 404)

  //   const entries = await listArchiveContents(item.filePath)
  //   return c.json({ entries })
  // })

  // // GET /media/:id/reading-position — retrieve saved reading position
  // router.get('/:id/reading-position', async (c) => {
  //   const id = c.req.param('id')
  //   const rows = await db
  //     .select()
  //     .from(readingPositions)
  //     .where(eq(readingPositions.mediaItemId, id))
  //   const pos = rows[0]
  //   if (!pos) return c.json(null)
  //   return c.json({ cfi: pos.cfi, chapterTitle: pos.chapterTitle })
  // })

  // const readingPositionSchema = z.object({
  //   cfi: z.string().min(1),
  //   chapterTitle: z.string().optional(),
  // })

  // // PUT /media/:id/reading-position — upsert reading position
  // router.put(
  //   '/:id/reading-position',
  //   validate('json', readingPositionSchema),
  //   async (c) => {
  //     const id = c.req.param('id')
  //     const body = c.req.valid('json')

  //     // Verify media item exists
  //     const itemRows = await db
  //       .select()
  //       .from(mediaItems)
  //       .where(eq(mediaItems.id, id))
  //     if (!itemRows[0]) return c.json({ error: 'Not found' }, 404)

  //     const existing = await db
  //       .select()
  //       .from(readingPositions)
  //       .where(eq(readingPositions.mediaItemId, id))

  //     if (existing[0]) {
  //       await db
  //         .update(readingPositions)
  //         .set({
  //           cfi: body.cfi,
  //           ...(body.chapterTitle !== undefined
  //             ? { chapterTitle: body.chapterTitle }
  //             : {}),
  //           updatedAt: new Date(),
  //         })
  //         .where(eq(readingPositions.mediaItemId, id))
  //     } else {
  //       const crypto = await import('node:crypto')
  //       await db.insert(readingPositions).values({
  //         id: crypto.randomUUID(),
  //         mediaItemId: id,
  //         cfi: body.cfi,
  //         ...(body.chapterTitle !== undefined
  //           ? { chapterTitle: body.chapterTitle }
  //           : {}),
  //       })
  //     }

  //     return c.json({ ok: true })
  //   },
  // )

  // const progressSchema = z.object({
  //   position: z.number().int().min(0),
  //   duration: z.number().int().min(0).optional(),
  //   completed: z.boolean().optional(),
  // })

  // // PUT /media/:id/progress — save playback/reading position
  // router.put('/:id/progress', validate('json', progressSchema), async (c) => {
  //   const id = c.req.param('id')
  //   const user = c.get('user')

  //   if (!user) return c.json({ error: 'Unauthorized' }, 401)

  //   const body = c.req.valid('json')

  //   const rows = await db
  //     .select({ id: mediaItems.id })
  //     .from(mediaItems)
  //     .where(eq(mediaItems.id, id))
  //   if (!rows[0]) return c.json({ error: 'Not found' }, 404)

  //   const existing = await db
  //     .select()
  //     .from(mediaProgress)
  //     .where(
  //       and(
  //         eq(mediaProgress.userId, user.id),
  //         eq(mediaProgress.mediaItemId, id),
  //       ),
  //     )

  //   if (existing[0]) {
  //     await db
  //       .update(mediaProgress)
  //       .set({
  //         position: body.position,
  //         ...(body.duration !== undefined ? { duration: body.duration } : {}),
  //         ...(body.completed !== undefined
  //           ? { completed: body.completed }
  //           : {}),
  //         updatedAt: new Date(),
  //       })
  //       .where(
  //         and(
  //           eq(mediaProgress.userId, user.id),
  //           eq(mediaProgress.mediaItemId, id),
  //         ),
  //       )
  //   } else {
  //     await db.insert(mediaProgress).values({
  //       userId: user.id,
  //       mediaItemId: id,
  //       position: body.position,
  //       duration: body.duration ?? 0,
  //       completed: body.completed ?? false,
  //     })
  //   }

  //   return c.json({ ok: true })
  // })

  // POST /media/:id/favorite — add to favorites
  // (idempotent)
  // router.post('/:id/groups/:type', async (c) => {
  //   const user = c.get('user')
  //   const id = c.req.param('id')
  //   const type = c.req.param('type') as GroupType
  //   const [item] = await db
  //     .select({ id: mediaItems.id })
  //     .from(mediaItems)
  //     .where(eq(mediaItems.id, id))
  //   if (!item) return c.json({ error: 'Not found' }, 404)

  //   const group = await db
  //     .select()
  //     .from(groups)
  //     .innerJoin(groupItems, eq(groupItems.groupId, groups.id))
  //     .where(and(eq(groups.type, type), eq(groups.userId, user.id)))
  //   // await db
  //   //   .insert(favorites)
  //   //   .values({ userId: user.id, mediaItemId: id, type })
  //   //   .onConflictDoNothing()
  //   return c.json({ favorited: true })
  // })
  // router.post('/:id/favorite', async (c) => {
  //   const user = c.get('user')
  //   const id = c.req.param('id')
  //   const [item] = await db
  //     .select({ id: mediaItems.id })
  //     .from(mediaItems)
  //     .where(eq(mediaItems.id, id))
  //   if (!item) return c.json({ error: 'Not found' }, 404)
  //   await db
  //     .insert(favorites)
  //     .values({ userId: user.id, mediaItemId: id })
  //     .onConflictDoNothing()
  //   return c.json({ favorited: true })
  // })

  // DELETE /media/:id/favorite — remove from favorites
  // router.delete('/:id/favorite', async (c) => {
  //   const user = c.get('user')
  //   const id = c.req.param('id')
  //   await db
  //     .delete(favorites)
  //     .where(and(eq(favorites.userId, user.id), eq(favorites.mediaItemId, id)))
  //   return c.json({ favorited: false })
  // })

  // POST /media/:id/watchlist — add to watchlist (idempotent)
  // router.post('/:id/watchlist', async (c) => {
  //   const user = c.get('user')
  //   const id = c.req.param('id')
  //   const [item] = await db
  //     .select({ id: mediaItems.id })
  //     .from(mediaItems)
  //     .where(eq(mediaItems.id, id))
  //   if (!item) return c.json({ error: 'Not found' }, 404)
  //   await db
  //     .insert(watchlist)
  //     .values({ userId: user.id, mediaItemId: id })
  //     .onConflictDoNothing()
  //   return c.json({ watchlisted: true })
  // })

  // DELETE /media/:id/watchlist — remove from watchlist
  // router.delete('/:id/watchlist', async (c) => {
  //   const user = c.get('user')
  //   const id = c.req.param('id')
  //   await db
  //     .delete(watchlist)
  //     .where(and(eq(watchlist.userId, user.id), eq(watchlist.mediaItemId, id)))
  //   return c.json({ watchlisted: false })
  // })

  return router
}
