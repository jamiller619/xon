import { unlink } from 'node:fs/promises'
import { type Client, createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectionItems, collections, mediaItems } from '../../../db/schema.ts'
import { makeMediaRouter } from '../../../routes/media.ts'

describe('Media bulk contract', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: Hono
  let databasePath: string

  beforeEach(async () => {
    // libSQL transactions use a second connection, so use a unique temporary
    // file rather than a connection-local :memory: database.
    databasePath = `/tmp/xon-media-bulk-${crypto.randomUUID()}.db`
    client = createClient({ url: `file:${databasePath}` })
    db = drizzle(client)
    await client.batch([
      `CREATE TABLE media_items (
        id text PRIMARY KEY NOT NULL,
        created_at integer NOT NULL,
        updated_at integer,
        library_id text NOT NULL,
        data_source_id text,
        match_id text,
        match_id_source text,
        file_path text NOT NULL,
        file_size integer NOT NULL,
        file_metadata text NOT NULL,
        media_type text DEFAULT 'application/octet-stream' NOT NULL,
        title text NOT NULL,
        description text,
        metadata text DEFAULT '{}' NOT NULL,
        drm_protected integer DEFAULT false NOT NULL,
        scanned_at integer NOT NULL,
        tags text DEFAULT '[]' NOT NULL
      )`,
      `CREATE TABLE collections (
        id text PRIMARY KEY NOT NULL,
        created_at integer NOT NULL,
        updated_at integer,
        user_id text NOT NULL,
        type text NOT NULL,
        title text NOT NULL,
        parent_collection_id text,
        metadata text DEFAULT '{}' NOT NULL
      )`,
      `CREATE TABLE collection_items (
        collection_id text NOT NULL,
        media_item_id text NOT NULL,
        sort_order integer DEFAULT 0 NOT NULL,
        PRIMARY KEY (collection_id, media_item_id)
      )`,
    ])

    const now = new Date('2026-08-14T12:00:00.000Z')
    await db
      .insert(mediaItems)
      .values([mediaItem('first', now), mediaItem('second', now)])
    await db.insert(collections).values({
      id: 'collection-1',
      createdAt: now,
      userId: 'user-1',
      type: 'collection',
      title: 'Bulk target',
      metadata: '{}',
    })

    app = new Hono().route('/media', makeMediaRouter(db))
  })

  afterEach(async () => {
    client.close()
    await unlink(databasePath).catch(() => undefined)
  })

  it('validates action-specific JSON before route logic', async () => {
    const response = await bulkRequest({
      action: 'move-to-collection',
      ids: ['first'],
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    })
  })

  it('updates one item without replacing unrelated metadata', async () => {
    const response = await app.request('/media/first', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed', tags: ['edited'] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: 'first',
      title: 'Renamed',
      metadata: { nested: { retained: true }, tags: ['edited'] },
    })
  })

  it('rejects the whole update if any requested item is missing', async () => {
    const response = await bulkRequest({
      action: 'update',
      ids: ['first', 'missing'],
      updates: { genre: 'Drama' },
    })

    expect(response.status).toBe(404)
    const first = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
      .where(eq(mediaItems.id, 'first'))
      .get()
    expect(first?.metadata).toEqual({ nested: { retained: true } })
  })

  it('updates every item transactionally without mutating fetched metadata', async () => {
    const response = await bulkRequest({
      action: 'update',
      ids: ['first', 'second'],
      updates: { genre: 'Drama', tags: ['favorite'], contentRating: 'PG' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ updated: 2 })
    const rows = await db
      .select({ metadata: mediaItems.metadata })
      .from(mediaItems)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.metadata).toEqual({
        nested: { retained: true },
        genre: 'Drama',
        tags: ['favorite'],
        contentRating: 'PG',
      })
    }
  })

  it('moves every requested item in one successful operation', async () => {
    const response = await bulkRequest({
      action: 'move-to-collection',
      ids: ['first', 'second'],
      collectionId: 'collection-1',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ moved: 2 })
    expect(await db.select().from(collectionItems)).toHaveLength(2)
  })

  function bulkRequest(body: unknown) {
    return app.request('/media/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
})

function mediaItem(id: string, date: Date): typeof mediaItems.$inferInsert {
  return {
    id,
    libraryId: 'library-1',
    dataSourceId: null,
    filePath: `/${id}.mp4`,
    fileSize: 100,
    fileMetadata: {},
    mediaType: 'video/mp4',
    title: id,
    description: null,
    metadata: { nested: { retained: true } },
    drmProtected: false,
    scannedAt: date,
    tags: [],
    createdAt: date,
  }
}
