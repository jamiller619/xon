import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { type Metadata, posterUrl } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import sharp from 'sharp'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import {
  libraryImageCacheReference,
  resolveCacheReference,
  resolveLocalArtworkPath,
} from '../media/cachePaths.ts'
import { getMediaByLibraryId } from './libraryService.ts'

const logger = createLogger('library-thumbnails')

const CELL_W = 150
const CELL_H = 225
const COLS = 4
const ROWS = 4
const GAP = 6
const GRID_W = COLS * CELL_W + (COLS - 1) * GAP
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP
const THUMBNAIL_W = 800
const THUMBNAIL_H = 600
const PERSPECTIVE = 3200
const ROTATE_X = (20 * Math.PI) / 180
const ROTATE_Y = (-10 * Math.PI) / 180
const SCALE = 1.5
const THUMBNAIL_VERSION = 2
const POSTER_FETCH_TIMEOUT_MS = 4000

function extractPosterUrl(metadata: Metadata): string | null {
  return posterUrl(metadata.images?.poster) ?? null
}

async function fetchPoster(src: string): Promise<Buffer | null> {
  try {
    let raw: Buffer
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src, {
        signal: AbortSignal.timeout(POSTER_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return null
      raw = Buffer.from(await res.arrayBuffer())
    } else {
      const filePath = resolveLocalArtworkPath(src)
      if (!filePath) return null
      raw = await readFile(filePath)
    }
    return await sharp(raw)
      .resize(CELL_W, CELL_H, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

/**
 * Projects a 4:3 image onto the same plane previously rendered by
 * LibraryCard's CSS transform. Keeping the projection in the asset makes the
 * generated image portable and leaves uploaded library artwork untouched.
 */
export async function applyLibraryThumbnailPerspective(
  input: Buffer,
): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .resize(THUMBNAIL_W, THUMBNAIL_H, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const output = Buffer.alloc(THUMBNAIL_W * THUMBNAIL_H * info.channels)
  const cosX = Math.cos(ROTATE_X)
  const sinX = Math.sin(ROTATE_X)
  const cosY = Math.cos(ROTATE_Y)
  const sinY = Math.sin(ROTATE_Y)

  // Coefficients for scale(), rotateY(), then rotateX(), matching CSS's
  // right-to-left transform application order.
  const projectedXFromX = SCALE * cosY
  const projectedYFromX = SCALE * sinX * sinY
  const projectedYFromY = SCALE * cosX
  const depthFromX = -SCALE * cosX * sinY
  const depthFromY = SCALE * sinX
  const centerX = THUMBNAIL_W / 2
  const centerY = THUMBNAIL_H / 2

  for (let outputY = 0; outputY < THUMBNAIL_H; outputY++) {
    const screenY = outputY + 0.5 - centerY

    for (let outputX = 0; outputX < THUMBNAIL_W; outputX++) {
      const screenX = outputX + 0.5 - centerX

      // Invert the perspective projection to find this output pixel's point
      // on the original, untransformed image plane.
      const a = PERSPECTIVE * projectedXFromX + screenX * depthFromX
      const b = screenX * depthFromY
      const c = PERSPECTIVE * projectedYFromX + screenY * depthFromX
      const d = PERSPECTIVE * projectedYFromY + screenY * depthFromY
      const determinant = a * d - b * c
      if (Math.abs(determinant) < Number.EPSILON) continue

      const planeX =
        (screenX * PERSPECTIVE * d - b * screenY * PERSPECTIVE) / determinant
      const planeY =
        (a * screenY * PERSPECTIVE - screenX * PERSPECTIVE * c) / determinant
      const sourceX = planeX + centerX - 0.5
      const sourceY = planeY + centerY - 0.5
      if (
        sourceX < 0 ||
        sourceX >= THUMBNAIL_W - 1 ||
        sourceY < 0 ||
        sourceY >= THUMBNAIL_H - 1
      ) {
        continue
      }

      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const xWeight = sourceX - x0
      const yWeight = sourceY - y0
      const topLeft = (y0 * THUMBNAIL_W + x0) * info.channels
      const topRight = topLeft + info.channels
      const bottomLeft = topLeft + THUMBNAIL_W * info.channels
      const bottomRight = bottomLeft + info.channels
      const destination = (outputY * THUMBNAIL_W + outputX) * info.channels

      for (let channel = 0; channel < info.channels; channel++) {
        const top =
          data.readUInt8(topLeft + channel) * (1 - xWeight) +
          data.readUInt8(topRight + channel) * xWeight
        const bottom =
          data.readUInt8(bottomLeft + channel) * (1 - xWeight) +
          data.readUInt8(bottomRight + channel) * xWeight
        output[destination + channel] = Math.round(
          top * (1 - yWeight) + bottom * yWeight,
        )
      }
    }
  }

  return sharp(output, {
    raw: {
      width: THUMBNAIL_W,
      height: THUMBNAIL_H,
      channels: info.channels,
    },
  })
    .png()
    .toBuffer()
}

async function buildGrid(posters: Buffer[]): Promise<Buffer> {
  const total = COLS * ROWS
  const composites: sharp.OverlayOptions[] = []

  for (let i = 0; i < total; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    composites.push({
      input: posters[i % posters.length],
      left: col * (CELL_W + GAP),
      top: row * (CELL_H + GAP),
    })
  }

  const grid = await sharp({
    create: {
      width: GRID_W,
      height: GRID_H,
      channels: 3,
      background: { r: 20, g: 20, b: 20 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()

  return applyLibraryThumbnailPerspective(grid)
}

function thumbnailDir(): string {
  return join(config.get('appdata.cachePath'), 'library-thumbnails')
}

function thumbnailPath(libraryId: string): string {
  return join(thumbnailDir(), `${libraryId}-v${THUMBNAIL_VERSION}.png`)
}

function libraryImagesDir(libraryId: string): string {
  return resolve(
    join(config.get('appdata.cachePath'), 'library-images', libraryId),
  )
}

async function buildThumbnail(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<Buffer | null> {
  const rows = await getMediaByLibraryId(db, libraryId, {
    pageNumber: 1,
    pageSize: 24,
  })

  const posterUrls = [
    ...new Set(
      rows.data
        .map((r) => extractPosterUrl(r.metadata))
        .filter((u): u is string => u !== null),
    ),
  ].slice(0, COLS * ROWS)

  if (posterUrls.length === 0) return null

  // Fetch in batches to avoid hammering the network/disk
  const loaded: Buffer[] = []
  for (let i = 0; i < posterUrls.length; i += 6) {
    const batch = posterUrls.slice(i, i + 6)
    const results = await Promise.all(batch.map(fetchPoster))
    for (const r of results) {
      if (r !== null) loaded.push(r)
    }
  }

  if (loaded.length === 0) return null

  return buildGrid(loaded)
}

async function storeLibraryPoster(
  libraryId: string,
  data: Buffer,
  origin: 'generated' | 'uploaded',
  extension = 'png',
): Promise<string> {
  const reference = libraryImageCacheReference(
    libraryId,
    `${origin}-${randomUUID()}.${extension}`,
  )
  const destination = resolveCacheReference(reference)
  await mkdir(libraryImagesDir(libraryId), { recursive: true })
  await writeFile(destination, data)
  return reference
}

/** Stores user artwork byte-for-byte; uploaded images never receive a transform. */
export function storeUploadedLibraryPoster(
  libraryId: string,
  data: Buffer,
  extension: string,
): Promise<string> {
  return storeLibraryPoster(libraryId, data, 'uploaded', extension)
}

export async function generateLibraryPoster(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<string | null> {
  const buffer = await buildThumbnail(db, libraryId)
  if (!buffer) return null
  return storeLibraryPoster(libraryId, buffer, 'generated')
}

export async function removeLibraryPoster(
  libraryId: string,
  source: string,
): Promise<void> {
  const directory = libraryImagesDir(libraryId)
  const candidate = resolveLocalArtworkPath(source)
  if (!candidate) return
  if (!candidate.startsWith(`${directory}${sep}`)) return
  await unlink(candidate).catch(() => undefined)
}

/**
 * Builds (or rebuilds) the cached thumbnail for a library and atomically
 * writes it to disk. Safe to call while other requests are reading the
 * existing file — the write only becomes visible once complete.
 */
export async function rebuildThumbnail(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<void> {
  try {
    const buffer = await buildThumbnail(db, libraryId)
    if (!buffer) return

    const dir = thumbnailDir()
    await mkdir(dir, { recursive: true })

    const finalPath = thumbnailPath(libraryId)
    const tmpPath = `${finalPath}.tmp`
    await writeFile(tmpPath, buffer)
    await rename(tmpPath, finalPath)
  } catch (err) {
    logger.error('Failed to rebuild library thumbnail', {
      libraryId,
      error: String(err),
    })
  }
}

const inFlight = new Map<string, Promise<void>>()

/**
 * Returns the cached thumbnail file for a library, building it on first
 * request. Concurrent requests for the same library share a single build
 * instead of each triggering their own poster fetches + sharp composite.
 */
export async function getOrBuildThumbnail(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<{ path: string; mtimeMs: number } | null> {
  const filePath = thumbnailPath(libraryId)

  try {
    const stats = await stat(filePath)
    return { path: filePath, mtimeMs: stats.mtimeMs }
  } catch {
    // no cached file yet — build one below
  }

  let build = inFlight.get(libraryId)
  if (!build) {
    build = rebuildThumbnail(db, libraryId)
    inFlight.set(libraryId, build)
    build.finally(() => inFlight.delete(libraryId))
  }
  await build

  try {
    const stats = await stat(filePath)
    return { path: filePath, mtimeMs: stats.mtimeMs }
  } catch {
    return null
  }
}
