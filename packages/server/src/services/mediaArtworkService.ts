import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { posterImages } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import config from '../config.ts'
import { mediaItems } from '../db/schema.ts'
import {
  isThumbnailCacheReference,
  mediaImageCacheReference,
  resolveCacheReference,
  resolveLocalArtworkPath,
} from '../media/cachePaths.ts'
import { resolveMediaItemFilePath } from '../media/mediaFilePaths.ts'
import {
  generateVideoBackdrops,
  generateVideoPosters,
} from '../media/videoThumbnails.ts'
import { rebuildThumbnail } from './libraryThumbnailService.ts'
import { findMatchedPosters } from './metadataMatchingService.ts'

export const ARTWORK_KINDS = ['poster', 'backdrop', 'logo'] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

export interface PosterEntryObject {
  src: string
  thumbnails?: { small: string; medium: string; large: string } | undefined
}

export type PosterEntry = string | PosterEntryObject

export interface ArtworkImages {
  poster: PosterEntry[]
  backdrop: string[]
  logo: string[]
}

export const MAX_ARTWORK_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_FOUND_POSTERS_PER_REQUEST = 6
const MAX_THUMBNAIL_SOURCE_BYTES = 25 * 1024 * 1024
const THUMBNAIL_FETCH_TIMEOUT_MS = 8_000
const MAX_THUMBNAIL_REDIRECTS = 3
const THUMBNAIL_DIMENSIONS = {
  small: 150,
  medium: 300,
  large: 600,
} as const
export type ThumbnailSize = keyof typeof THUMBNAIL_DIMENSIONS

const SUPPORTED_ARTWORK_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

type MediaRow = typeof mediaItems.$inferSelect

export type ThumbnailResult =
  | { status: 'media-not-found' }
  | { status: 'image-not-found' }
  | {
      status: 'ok'
      data: Buffer
      contentType: string
      source: string
    }

export type ArtworkImageResult =
  | { status: 'media-not-found' }
  | { status: 'image-not-found' }
  | { status: 'unsupported' }
  | { status: 'redirect'; source: string }
  | { status: 'ok'; data: Buffer; contentType: string; source: string }

export type ArtworkMutationResult =
  | { status: 'media-not-found' }
  | { status: 'ok'; images: ArtworkImages }

export type FindPostersResult =
  | { status: 'media-not-found' }
  | { status: 'unmatched' }
  | { status: 'provider-error'; message: string }
  | { status: 'ok'; images: ArtworkImages }

export type GenerateArtworkResult =
  | { status: 'media-not-found' }
  | { status: 'not-video' }
  | { status: 'generation-failed' }
  | { status: 'ok'; images: ArtworkImages }

export type UploadArtworkResult =
  | { status: 'unsupported' }
  | { status: 'ok'; images: ArtworkImages }

export async function getArtworkMediaItem(
  db: LibSQLDatabase,
  id: string,
): Promise<MediaRow | undefined> {
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  return rows[0]
}

export async function getMediaThumbnail(
  db: LibSQLDatabase,
  id: string,
  size: ThumbnailSize,
): Promise<ThumbnailResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }

  const poster = posterImages(
    (item.metadata.images as { poster?: unknown } | undefined)?.poster as
      | Parameters<typeof posterImages>[0]
      | undefined,
  )[0]
  if (!poster) return { status: 'image-not-found' }

  let data: Buffer | null = null
  let contentType = 'image/jpeg'
  const generatedPath = poster.thumbnails?.[size]
  if (generatedPath) {
    const filePath = resolveLocalArtworkPath(generatedPath)
    try {
      if (filePath) data = await readFile(filePath)
    } catch {
      // Fall back to the poster source and repair the display cache.
    }
  }

  if (!data) {
    data = await renderThumbnail(id, poster.src, size)
    contentType = 'image/webp'
  }
  if (!data) return { status: 'image-not-found' }

  return { status: 'ok', data, contentType, source: poster.src }
}

export async function getArtworkImage(
  db: LibSQLDatabase,
  id: string,
  kind: ArtworkKind,
  index: number,
): Promise<ArtworkImageResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }

  const entry = normalizedArtworkImages(item.metadata)[kind][index]
  if (!entry) return { status: 'image-not-found' }

  const source = typeof entry === 'string' ? entry : imageSource(entry)
  if (/^https?:\/\//i.test(source) || source.startsWith('/api/')) {
    return { status: 'redirect', source }
  }

  const filePath = resolveLocalArtworkPath(source)
  if (!filePath) return { status: 'image-not-found' }

  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    return { status: 'image-not-found' }
  }

  const detected = await fileTypeFromBuffer(data)
  if (!detected || !SUPPORTED_ARTWORK_MIME_TYPES.has(detected.mime)) {
    return { status: 'unsupported' }
  }

  return { status: 'ok', data, contentType: detected.mime, source }
}

export async function replaceArtworkImages(
  db: LibSQLDatabase,
  id: string,
  nextImages: ArtworkImages,
): Promise<ArtworkMutationResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }

  const previousImages = normalizedArtworkImages(item.metadata)
  const metadata = { ...item.metadata, images: nextImages }

  await db
    .update(mediaItems)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(mediaItems.id, id))

  const retained = new Set(artworkCacheFiles(nextImages))
  const removedCacheFiles = artworkCacheFiles(previousImages).filter(
    (source) => isCachedArtworkPath(source, id) && !retained.has(source),
  )
  await Promise.all(
    removedCacheFiles.flatMap((source) => {
      const filePath = resolveLocalArtworkPath(source)
      return filePath ? [unlink(filePath).catch(() => undefined)] : []
    }),
  )
  void rebuildThumbnail(db, item.libraryId)

  return { status: 'ok', images: nextImages }
}

export async function appendMatchedPosters(
  db: LibSQLDatabase,
  id: string,
): Promise<FindPostersResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  if (!item.matchId) return { status: 'unmatched' }

  try {
    const found = await findMatchedPosters(db, id)
    const images = normalizedArtworkImages(item.metadata)
    const existing = new Set(images.poster.map(imageSource))
    let added = 0

    for (const poster of found) {
      const source = imageSource(poster)
      if (existing.has(source)) continue
      existing.add(source)
      images.poster.push(poster)
      added += 1
      if (added === MAX_FOUND_POSTERS_PER_REQUEST) break
    }

    const metadata = { ...item.metadata, images }
    await db
      .update(mediaItems)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(mediaItems.id, id))

    void rebuildThumbnail(db, item.libraryId)
    return { status: 'ok', images }
  } catch (error) {
    return {
      status: 'provider-error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function generateArtworkPosters(
  db: LibSQLDatabase,
  id: string,
): Promise<GenerateArtworkResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  if (!item.mediaType.startsWith('video/')) return { status: 'not-video' }

  const sourcePath = await resolveMediaItemFilePath(db, item)
  const posters = await generateVideoPosters(sourcePath, id)
  if (!posters) return { status: 'generation-failed' }

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
        Object.values(poster.thumbnails ?? {}).flatMap((path) => {
          const filePath = resolveLocalArtworkPath(path)
          return filePath ? [unlink(filePath).catch(() => undefined)] : []
        }),
      ),
    )
    throw error
  }

  void rebuildThumbnail(db, item.libraryId)
  return { status: 'ok', images }
}

export async function generateArtworkBackdrops(
  db: LibSQLDatabase,
  id: string,
): Promise<GenerateArtworkResult> {
  const item = await getArtworkMediaItem(db, id)
  if (!item) return { status: 'media-not-found' }
  if (!item.mediaType.startsWith('video/')) return { status: 'not-video' }

  const sourcePath = await resolveMediaItemFilePath(db, item)
  const backdrops = await generateVideoBackdrops(sourcePath, id)
  if (!backdrops) return { status: 'generation-failed' }

  const images = normalizedArtworkImages(item.metadata)
  images.backdrop.push(...backdrops)
  const metadata = { ...item.metadata, images }

  try {
    await db
      .update(mediaItems)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(mediaItems.id, id))
  } catch (error) {
    await Promise.all(
      backdrops.flatMap((path) => {
        const filePath = resolveLocalArtworkPath(path)
        return filePath ? [unlink(filePath).catch(() => undefined)] : []
      }),
    )
    throw error
  }

  void rebuildThumbnail(db, item.libraryId)
  return { status: 'ok', images }
}

export async function uploadArtwork(
  db: LibSQLDatabase,
  item: MediaRow,
  kind: ArtworkKind,
  data: Buffer,
): Promise<UploadArtworkResult> {
  const detected = await fileTypeFromBuffer(data)
  if (!detected || !SUPPORTED_ARTWORK_MIME_TYPES.has(detected.mime)) {
    return { status: 'unsupported' }
  }

  const reference = mediaImageCacheReference(
    item.id,
    `${randomUUID()}.${detected.ext}`,
  )
  const destination = resolveCacheReference(reference)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, data)

  const images = normalizedArtworkImages(item.metadata)
  if (kind === 'poster') images.poster.push(reference)
  else images[kind].push(reference)

  const metadata = { ...item.metadata, images }
  try {
    await db
      .update(mediaItems)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(mediaItems.id, item.id))
  } catch (error) {
    await unlink(destination).catch(() => undefined)
    throw error
  }

  void rebuildThumbnail(db, item.libraryId)
  return { status: 'ok', images }
}

function imageSource(entry: PosterEntry): string {
  return typeof entry === 'string' ? entry : entry.src
}

function imageList(value: unknown): PosterEntry[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value as PosterEntry]
}

function normalizedArtworkImages(
  metadata: Record<string, unknown>,
): ArtworkImages {
  const images = (metadata.images ?? {}) as Record<string, unknown>
  return {
    poster: imageList(images.poster).map((entry) =>
      typeof entry === 'string'
        ? entry
        : {
            ...entry,
            ...(entry.thumbnails
              ? { thumbnails: { ...entry.thumbnails } }
              : {}),
          },
    ),
    backdrop: imageList(images.backdrop).map(imageSource),
    logo: imageList(images.logo).map(imageSource),
  }
}

function artworkSources(images: ArtworkImages): string[] {
  return [...images.poster.map(imageSource), ...images.backdrop, ...images.logo]
}

function artworkCacheFiles(images: ArtworkImages): string[] {
  return [
    ...artworkSources(images),
    ...images.poster.flatMap((entry) =>
      typeof entry === 'string' ? [] : Object.values(entry.thumbnails ?? {}),
    ),
  ]
}

function cachedArtworkDirectory(mediaId: string): string {
  return resolve(join(config.get('appdata.cachePath'), 'media-images', mediaId))
}

function isCachedArtworkPath(source: string, mediaId: string): boolean {
  const candidate = resolveLocalArtworkPath(source)
  if (!candidate) return false

  const directory = cachedArtworkDirectory(mediaId)
  if (candidate.startsWith(`${directory}${sep}`)) return true

  if (!isThumbnailCacheReference(source)) return false
  const thumbnailDirectory = resolve(
    join(config.get('appdata.cachePath'), 'thumbnails'),
  )
  return (
    candidate.startsWith(`${thumbnailDirectory}${sep}`) &&
    basename(candidate).startsWith(`${mediaId}_`)
  )
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

  if (source.startsWith('/api/')) return null

  const filePath = resolveLocalArtworkPath(source)
  if (!filePath) return null

  try {
    return await readFile(filePath)
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
    }

    return data
  } catch {
    return null
  }
}
