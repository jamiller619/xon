import { readFile } from 'node:fs/promises'
import type { Metadata } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import sharp from 'sharp'
import { libraries, mediaItems } from '../db/schema.ts'

const CELL_W = 150
const CELL_H = 225
const COLS = 4
const ROWS = 4
const GAP = 6
const GRID_W = COLS * CELL_W + (COLS - 1) * GAP
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP


function extractPosterUrl(metadata: Metadata): string | null {
  const poster = metadata.images?.poster
  if (!poster) return null
  return Array.isArray(poster) ? (poster[0] ?? null) : poster
}

async function fetchPoster(src: string): Promise<Buffer | null> {
  try {
    let raw: Buffer
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src, { signal: AbortSignal.timeout(8000) })
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


export function makeLibraryThumbnailRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  router.get('/:id/thumbnail', async (c) => {
    const id = c.req.param('id')

    const [library] = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(eq(libraries.id, id))
    if (!library) return c.json({ error: 'Not found' }, 404)

    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
      .where(eq(mediaItems.libraryId, id))
      .limit(200)

    const posterUrls = [
      ...new Set(
        rows
          .map((r) => extractPosterUrl(r.metadata))
          .filter((u): u is string => u !== null),
      ),
    ].slice(0, COLS * ROWS)

    if (posterUrls.length === 0) {
      return c.json({ error: 'No posters available for this library' }, 404)
    }

    // Fetch in batches of 6 to avoid hammering the network/disk
    const loaded: Buffer[] = []
    for (let i = 0; i < posterUrls.length; i += 6) {
      const batch = posterUrls.slice(i, i + 6)
      const results = await Promise.all(batch.map(fetchPoster))
      for (const r of results) {
        if (r !== null) loaded.push(r)
      }
    }

    if (loaded.length === 0) {
      return c.json({ error: 'Failed to load any poster images' }, 500)
    }

    const result = await buildGrid(loaded)

    return c.body(new Uint8Array(result), 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    })
  })

  return router
}
