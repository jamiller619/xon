import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Metadata } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import sharp from 'sharp'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { getMediaByLibraryId } from './libraryService.ts'

const logger = createLogger('library-thumbnails')

const CELL_W = 150
const CELL_H = 225
const COLS = 4
const ROWS = 4
const GAP = 6
const GRID_W = COLS * CELL_W + (COLS - 1) * GAP
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP
const POSTER_FETCH_TIMEOUT_MS = 4000

function extractPosterUrl(metadata: Metadata): string | null {
  const poster = metadata.images?.poster
  if (!poster) return null
  return Array.isArray(poster) ? (poster[0] ?? null) : poster
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
      raw = await readFile(src)
    }
    return await sharp(raw)
      .resize(CELL_W, CELL_H, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
  } catch {
    return null
  }
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

  return sharp({
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
}

function thumbnailDir(): string {
  return join(config.get('appdata.cachePath'), 'library-thumbnails')
}

function thumbnailPath(libraryId: string): string {
  return join(thumbnailDir(), `${libraryId}.png`)
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
