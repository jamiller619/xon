import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { createReadStream } from 'node:fs'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { isIP } from 'node:net'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { posterImages, type SortProps } from '@xon/shared'
import { eq, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { fileTypeFromBuffer } from 'file-type'
import { Hono } from 'hono'
import sharp from 'sharp'
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
import { generateVideoPosters } from '../media/videoThumbnails.ts'
import { rebuildThumbnail } from '../services/libraryThumbnailService.ts'
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

const ARTWORK_KINDS = ['poster', 'backdrop', 'logo'] as const
type ArtworkKind = (typeof ARTWORK_KINDS)[number]

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

type PosterEntry = z.infer<typeof posterImageSchema>
type ArtworkImages = z.infer<typeof artworkImagesSchema>

const MAX_ARTWORK_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_THUMBNAIL_SOURCE_BYTES = 25 * 1024 * 1024
const THUMBNAIL_FETCH_TIMEOUT_MS = 8_000
const MAX_THUMBNAIL_REDIRECTS = 3
const THUMBNAIL_DIMENSIONS = {
  small: 150,
  medium: 300,
  large: 600,
} as const
type ThumbnailSize = keyof typeof THUMBNAIL_DIMENSIONS

const SUPPORTED_ARTWORK_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function isArtworkKind(value: string): value is ArtworkKind {
  return ARTWORK_KINDS.includes(value as ArtworkKind)
}

function imageSource(entry: PosterEntry): string {
  return typeof entry === 'string' ? entry : entry.src
}

function imageList(value: unknown): PosterEntry[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value as PosterEntry]
}

function artworkSources(images: ArtworkImages): string[] {
  return [...images.poster.map(imageSource), ...images.backdrop, ...images.logo]
}

function cachedArtworkDirectory(mediaId: string): string {
  return resolve(join(config.get('appdata.cachePath'), 'media-images', mediaId))
}

function isCachedArtworkPath(source: string, mediaId: string): boolean {
  const directory = cachedArtworkDirectory(mediaId)
  const candidate = resolve(source)
  return candidate.startsWith(`${directory}${sep}`)
}

function normalizedArtworkImages(
  metadata: Record<string, unknown>,
): ArtworkImages {
  const images = (metadata.images ?? {}) as Record<string, unknown>
  return {
    poster: imageList(images.poster),
    backdrop: imageList(images.backdrop).map(imageSource),
    logo: imageList(images.logo).map(imageSource),
  }
}

function renderedThumbnailPath(
  mediaId: string,
  source: string,
  size: ThumbnailSize,
): string {
  const sourceHash = createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 16)
  return join(
    config.get('appdata.cachePath'),
    'thumbnails',
    'rendered',
    `${mediaId}-${sourceHash}-${size}.webp`,
  )
}

async function readRemoteThumbnailSource(
  source: string,
): Promise<Buffer | null> {
  try {
    let url = new URL(source)
    let response: Response | undefined

    for (let redirects = 0; redirects <= MAX_THUMBNAIL_REDIRECTS; redirects++) {
      if (!(await isSafeRemoteUrl(url))) return null

      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(THUMBNAIL_FETCH_TIMEOUT_MS),
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) break

      const location = response.headers.get('location')
      if (!location || redirects === MAX_THUMBNAIL_REDIRECTS) return null
      url = new URL(location, url)
    }

    if (!response?.ok) return null

    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return null
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_THUMBNAIL_SOURCE_BYTES
    ) {
      return null
    }

    if (!response.body) return null

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_THUMBNAIL_SOURCE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks, total)
  } catch {
    return null
  }
}

async function isSafeRemoteUrl(url: URL): Promise<boolean> {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hostname === 'localhost'
  ) {
    return false
  }

  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true })
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => !isPrivateAddress(address))
    )
  } catch {
    return false
  }
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }

  if (version === 6) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith('::ffff:')) {
      return isPrivateAddress(normalized.slice('::ffff:'.length))
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    )
  }

  return true
}

async function readThumbnailSource(source: string): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(source)) {
    return readRemoteThumbnailSource(source)
  }

  // Relative API URLs cannot be resolved safely from the headless server.
  if (source.startsWith('/api/')) return null

  try {
    return await readFile(source)
  } catch {
    return null
  }
}

async function renderThumbnail(
  mediaId: string,
  source: string,
  size: ThumbnailSize,
): Promise<Buffer | null> {
  const cachePath = renderedThumbnailPath(mediaId, source, size)

  try {
    return await readFile(cachePath)
  } catch {
    // Generate the cache entry below.
  }

  const original = await readThumbnailSource(source)
  if (!original) return null

  try {
    const data = await sharp(original)
      .resize(THUMBNAIL_DIMENSIONS[size], THUMBNAIL_DIMENSIONS[size], {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer()

    const temporaryPath = `${cachePath}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(temporaryPath, data)
      await rename(temporaryPath, cachePath)
    } catch {
      await unlink(temporaryPath).catch(() => undefined)
      // A cache write failure should not prevent serving the resized image.
    }

    return data
  } catch {
    return null
  }
}

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

  const THUMBNAIL_SIZES = new Set<ThumbnailSize>(['small', 'medium', 'large'])

  // GET /media/:id/thumbnail?size=small|medium|large — the single thumbnail
  // API for local, uploaded, and remote posters. Existing generated JPEGs are
  // served directly; other poster sources are resized and cached as WebP.
  router.get('/:id/thumbnail', async (c) => {
    const id = c.req.param('id')
    const requestedSize = c.req.query('size') ?? 'medium'

    // Guard against path traversal — ids are UUIDs.
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      !THUMBNAIL_SIZES.has(requestedSize as ThumbnailSize)
    ) {
      return c.json({ error: 'Not found' }, 404)
    }
    const size = requestedSize as ThumbnailSize

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const poster = posterImages(
      (item.metadata.images as { poster?: unknown } | undefined)?.poster as
        | Parameters<typeof posterImages>[0]
        | undefined,
    )[0]
    if (!poster) return c.json({ error: 'Not found' }, 404)

    let data: Buffer | null = null
    let contentType = 'image/jpeg'
    const generatedPath = poster.thumbnails?.[size]
    if (generatedPath) {
      try {
        data = await readFile(generatedPath)
      } catch {
        // Fall back to the poster source and repair the display cache.
      }
    }

    if (!data) {
      data = await renderThumbnail(id, poster.src, size)
      contentType = 'image/webp'
    }
    if (!data) return c.json({ error: 'Image not found' }, 404)

    const etag = computeETag([id, poster.src, size, data.length])
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    return c.body(new Uint8Array(data), 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      ETag: etag,
    })
  })

  // GET /media/:id/images/:kind/:index — serve the indexed artwork entry.
  // Remote artwork redirects to its provider; local/cache files are streamed.
  router.get('/:id/images/:kind/:index', async (c) => {
    const id = c.req.param('id')
    const kind = c.req.param('kind')
    const index = Number.parseInt(c.req.param('index'), 10)

    if (!isArtworkKind(kind) || !Number.isInteger(index) || index < 0) {
      return c.json({ error: 'Not found' }, 404)
    }

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const images = normalizedArtworkImages(item.metadata)
    const entry = images[kind][index]
    if (!entry) return c.json({ error: 'Not found' }, 404)

    const source = typeof entry === 'string' ? entry : imageSource(entry)
    if (/^https?:\/\//i.test(source) || source.startsWith('/api/')) {
      return c.redirect(source, 302)
    }

    let data: Buffer
    try {
      data = await readFile(source)
    } catch {
      return c.json({ error: 'Image not found' }, 404)
    }

    const detected = await fileTypeFromBuffer(data)
    if (!detected || !SUPPORTED_ARTWORK_MIME_TYPES.has(detected.mime)) {
      return c.json({ error: 'Unsupported image type' }, 415)
    }

    const etag = computeETag([source, data.length])
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)

    return c.body(new Uint8Array(data), 200, {
      'Content-Type': detected.mime,
      'Cache-Control': 'private, no-cache',
      ETag: etag,
    })
  })

  // PUT /media/:id/images — persist the explicit display order for all
  // artwork groups and remove uploaded cache files no longer referenced.
  router.put(
    '/:id/images',
    validate('json', artworkImagesSchema),
    async (c) => {
      const id = c.req.param('id')
      const nextImages = c.req.valid('json')
      const rows = await db
        .select()
        .from(mediaItems)
        .where(eq(mediaItems.id, id))
      const item = rows[0]
      if (!item) return c.json({ error: 'Not found' }, 404)

      const previousImages = normalizedArtworkImages(item.metadata)
      const metadata = { ...item.metadata, images: nextImages }

      await db
        .update(mediaItems)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(mediaItems.id, id))

      const retained = new Set(artworkSources(nextImages))
      const removedCacheFiles = artworkSources(previousImages).filter(
        (source) => isCachedArtworkPath(source, id) && !retained.has(source),
      )
      await Promise.all(
        removedCacheFiles.map((source) =>
          unlink(source).catch(() => undefined),
        ),
      )
      void rebuildThumbnail(db, item.libraryId)

      return c.json({ images: nextImages })
    },
  )

  // POST /media/:id/images/posters/generate — append three posters captured
  // from random points in the item's video.
  router.post('/:id/images/posters/generate', async (c) => {
    const id = c.req.param('id')
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)
    if (!item.mediaType.startsWith('video/')) {
      return c.json(
        { error: 'Images can only be created from video items' },
        400,
      )
    }

    const posters = await generateVideoPosters(item.filePath, id)
    if (!posters) {
      return c.json({ error: 'Could not create images from this video' }, 500)
    }

    const images = normalizedArtworkImages(item.metadata)
    images.poster.push(...posters)
    const metadata = { ...item.metadata, images }

    try {
      await db
        .update(mediaItems)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(mediaItems.id, id))
    } catch (error) {
      await Promise.all(
        posters.flatMap((poster) =>
          Object.values(poster.thumbnails ?? {}).map((path) =>
            unlink(path).catch(() => undefined),
          ),
        ),
      )
      throw error
    }

    void rebuildThumbnail(db, item.libraryId)
    return c.json({ images }, 201)
  })

  // POST /media/:id/images/:kind — copy an uploaded image into the configured
  // cache directory and append it to the requested artwork group.
  router.post('/:id/images/:kind', async (c) => {
    const id = c.req.param('id')
    const kind = c.req.param('kind')
    if (!isArtworkKind(kind)) {
      return c.json({ error: 'Unknown artwork type' }, 400)
    }

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
    const item = rows[0]
    if (!item) return c.json({ error: 'Not found' }, 404)

    const form = await c.req.parseBody()
    const file = form.file
    if (!(file instanceof File)) {
      return c.json({ error: 'Choose an image to upload' }, 400)
    }
    if (file.size === 0 || file.size > MAX_ARTWORK_UPLOAD_BYTES) {
      return c.json({ error: 'Image must be between 1 byte and 20 MB' }, 413)
    }

    const data = Buffer.from(await file.arrayBuffer())
    const detected = await fileTypeFromBuffer(data)
    if (!detected || !SUPPORTED_ARTWORK_MIME_TYPES.has(detected.mime)) {
      return c.json(
        { error: 'Upload a JPEG, PNG, WebP, GIF, or AVIF image' },
        415,
      )
    }

    const directory = cachedArtworkDirectory(id)
    const destination = join(directory, `${randomUUID()}.${detected.ext}`)
    await mkdir(directory, { recursive: true })
    await writeFile(destination, data)

    const images = normalizedArtworkImages(item.metadata)
    if (kind === 'poster') images.poster.push(destination)
    else images[kind].push(destination)

    const metadata = { ...item.metadata, images }
    try {
      await db
        .update(mediaItems)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(mediaItems.id, id))
    } catch (error) {
      await unlink(destination).catch(() => undefined)
      throw error
    }

    void rebuildThumbnail(db, item.libraryId)
    return c.json({ images }, 201)
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
