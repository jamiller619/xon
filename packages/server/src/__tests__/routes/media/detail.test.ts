import { type Client, createClient } from '@libsql/client'
import { CollectionType } from '@xon/shared'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
  users,
} from '../../../db/schema.ts'
import { makeMediaRouter } from '../../../routes/media.ts'

describe('Media API - collection membership', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: Hono

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await client.batch([
      `CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        email_verified integer DEFAULT false NOT NULL,
        image text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        is_anonymous integer DEFAULT false
      )`,
      `CREATE TABLE libraries (
        id text PRIMARY KEY NOT NULL,
        created_at integer NOT NULL,
        updated_at integer,
        owner_id text NOT NULL,
        name text NOT NULL,
        description text,
        content_type text NOT NULL,
        scan_schedule text,
        data_sources text NOT NULL,
        images text DEFAULT '{"poster":[]}' NOT NULL
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
      `CREATE TABLE people (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        description text,
        avatar_url text,
        metadata text DEFAULT '{}' NOT NULL
      )`,
      `CREATE TABLE people_media (
        id text PRIMARY KEY NOT NULL,
        person_id text NOT NULL,
        media_id text NOT NULL,
        role text NOT NULL,
        "order" integer
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

    const now = new Date('2026-08-10T12:00:00.000Z')
    const currentUser = {
      id: 'user-1',
      name: 'Current User',
      email: 'current@example.com',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      isAnonymous: false,
    }

    await db.insert(users).values([
      currentUser,
      {
        id: 'user-2',
        name: 'Other User',
        email: 'other@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(libraries).values({
      id: 'library-1',
      ownerId: currentUser.id,
      name: 'Movies',
      type: 'video/movie',
      dataSources: [],
      createdAt: now,
    })
    await db.insert(mediaItems).values({
      id: 'media-1',
      libraryId: 'library-1',
      filePath: 'movie.mkv',
      fileSize: 1,
      fileMetadata: {},
      mediaType: 'video/x-matroska',
      title: 'Movie',
      scannedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(collections).values([
      {
        id: 'collection-b',
        userId: currentUser.id,
        type: CollectionType.Collection,
        title: 'B',
        createdAt: now,
      },
      {
        id: 'collection-other-user',
        userId: 'user-2',
        type: CollectionType.Collection,
        title: 'Other user',
        createdAt: now,
      },
    ])
    await db.insert(collectionItems).values([
      {
        collectionId: 'collection-b',
        mediaItemId: 'media-1',
        sortOrder: 0,
      },
      {
        collectionId: 'collection-other-user',
        mediaItemId: 'media-1',
        sortOrder: 0,
      },
    ])

    app = new Hono()
      .use('*', async (c, next) => {
        c.set('user', currentUser)
        c.set('session', null)
        await next()
      })
      .route('/media', makeMediaRouter(db))
  })

  afterEach(() => {
    client.close()
  })

  it("returns the current user's collection ids and refreshes its ETag", async () => {
    const firstResponse = await app.request('/media/media-1?withLibrary=true')

    expect(firstResponse.status).toBe(200)
    expect(await firstResponse.json()).toMatchObject({
      id: 'media-1',
      collectionIds: ['collection-b'],
    })
    const firstEtag = firstResponse.headers.get('ETag')
    expect(firstEtag).not.toBeNull()

    await db.insert(collections).values({
      id: 'collection-a',
      userId: 'user-1',
      type: CollectionType.Collection,
      title: 'A',
      createdAt: new Date('2026-08-10T12:01:00.000Z'),
    })
    await db.insert(collectionItems).values({
      collectionId: 'collection-a',
      mediaItemId: 'media-1',
      sortOrder: 0,
    })

    const refreshedResponse = await app.request(
      '/media/media-1?withLibrary=true',
      { headers: { 'If-None-Match': firstEtag ?? '' } },
    )

    expect(refreshedResponse.status).toBe(200)
    expect(await refreshedResponse.json()).toMatchObject({
      collectionIds: ['collection-a', 'collection-b'],
    })
  })
})
