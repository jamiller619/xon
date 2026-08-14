import { type Client, createClient } from '@libsql/client'
import { CollectionType } from '@xon/shared'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectionItems, collections, mediaItems } from '../../db/schema.ts'
import { makeCollectionsRouter } from '../../routes/collections.ts'

describe('Collections API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: Hono

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await client.batch([
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
      `CREATE TABLE collection_items (
        collection_id text NOT NULL,
        media_item_id text NOT NULL,
        sort_order integer DEFAULT 0 NOT NULL,
        PRIMARY KEY (collection_id, media_item_id)
      )`,
    ])

    const now = new Date('2026-08-11T12:00:00.000Z')
    await db.insert(collections).values([
      {
        id: 'mine',
        userId: 'user-1',
        type: CollectionType.Collection,
        title: 'Across libraries',
        metadata: '{}',
        createdAt: now,
      },
      {
        id: 'theirs',
        userId: 'user-2',
        type: CollectionType.Collection,
        title: 'Private collection',
        metadata: '{}',
        createdAt: now,
      },
    ])
    await db
      .insert(mediaItems)
      .values([
        mediaItem('first', 'library-a', 'First', now),
        mediaItem('second', 'library-b', 'Second', now),
      ])
    await db.insert(collectionItems).values([
      { collectionId: 'mine', mediaItemId: 'second', sortOrder: 0 },
      { collectionId: 'mine', mediaItemId: 'first', sortOrder: 1 },
      { collectionId: 'theirs', mediaItemId: 'first', sortOrder: 0 },
    ])

    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1' } as never)
      c.set('session', null)
      await next()
    })
    app.route('/collections', makeCollectionsRouter(db))
  })

  afterEach(() => client.close())

  it('paginates full media records in custom order across libraries', async () => {
    const firstPage = await app.request('/collections/mine/media?limit=1')

    expect(firstPage.status).toBe(200)
    expect(firstPage.headers.get('X-Total-Count')).toBe('2')
    expect(await firstPage.json()).toMatchObject([
      { id: 'second', libraryId: 'library-b', title: 'Second' },
    ])

    const secondPage = await app.request(
      '/collections/mine/media?limit=1&page=2',
    )
    expect(await secondPage.json()).toMatchObject([
      { id: 'first', libraryId: 'library-a', title: 'First' },
    ])
  })

  it('does not expose another users collection', async () => {
    const detail = await app.request('/collections/theirs')
    const media = await app.request('/collections/theirs/media')

    expect(detail.status).toBe(404)
    expect(media.status).toBe(404)
  })
})

function mediaItem(
  id: string,
  libraryId: string,
  title: string,
  date: Date,
): typeof mediaItems.$inferInsert {
  return {
    id,
    libraryId,
    dataSourceId: null,
    filePath: `/${id}.mp4`,
    fileSize: 100,
    fileMetadata: {},
    mediaType: 'video/mp4',
    title,
    description: null,
    metadata: {},
    drmProtected: false,
    scannedAt: date,
    tags: [],
    createdAt: date,
  }
}
