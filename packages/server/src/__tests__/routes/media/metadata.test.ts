import { unlink } from 'node:fs/promises'
import { type Client, createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../../db/migrate.ts'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
  users,
} from '../../../db/schema.ts'
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
    await migrateDatabase(db)

    const now = new Date('2026-08-14T12:00:00.000Z')
    const [user] = await db
      .insert(users)
      .values({
        publicId: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      })
      .returning({ id: users.id })
    if (!user) throw new Error('Failed to seed user')
    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'library-1',
        ownerId: user.id,
        name: 'Test Library',
        type: 'video/movie',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Failed to seed library')
    await db
      .insert(mediaItems)
      .values([
        mediaItem('first', now, library.id),
        mediaItem('second', now, library.id),
      ])
    await db.insert(collections).values({
      publicId: 'collection-1',
      createdAt: now,
      userId: user.id,
      type: 'collection',
      title: 'Bulk target',
      metadata: '{}',
    })

    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user', { id: user.id } as never)
      c.set('session', { id: 'test-session' } as never)
      await next()
    })
    app.route('/media', makeMediaRouter(db))
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
      metadata: { nested: { retained: true } },
      tags: ['edited'],
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
      .where(eq(mediaItems.publicId, 'first'))
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
      .select({ metadata: mediaItems.metadata, tags: mediaItems.tags })
      .from(mediaItems)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.metadata).toEqual({
        nested: { retained: true },
        genre: 'Drama',
        contentRating: 'PG',
      })
      expect(row.tags).toEqual(['favorite', 'genre:drama'])
    }
  })

  it('rejects manual writes to the reserved genre namespace', async () => {
    const response = await app.request('/media/first', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['favorite', 'genre:drama'] }),
    })

    expect(response.status).toBe(400)
    const [item] = await db
      .select({ tags: mediaItems.tags })
      .from(mediaItems)
      .where(eq(mediaItems.publicId, 'first'))
    expect(item?.tags).toEqual([])
  })

  it('normalizes manual tags while preserving generated genres', async () => {
    await db
      .update(mediaItems)
      .set({ tags: ['genre:drama'] })
      .where(eq(mediaItems.publicId, 'first'))

    const response = await app.request('/media/first', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [' Favorite ', 'favorite'] }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      tags: ['Favorite', 'genre:drama'],
    })
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

function mediaItem(
  publicId: string,
  date: Date,
  libraryId: number,
): typeof mediaItems.$inferInsert {
  return {
    publicId,
    libraryId,
    dataSourceId: null,
    filePath: `/${publicId}.mp4`,
    fileSize: 100,
    fileMetadata: {},
    mediaType: 'video/mp4',
    title: publicId,
    description: null,
    metadata: { nested: { retained: true } },
    drmProtected: false,
    scannedAt: date,
    tags: [],
    createdAt: date,
  }
}
