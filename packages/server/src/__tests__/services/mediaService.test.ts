import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { libraries, mediaItems, users } from '../../db/schema.ts'
import { getMediaByUser } from '../../services/mediaService.ts'

describe('mediaService.getMediaByUser', () => {
  let client: Client
  let db: LibSQLDatabase

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
        is_anonymous integer DEFAULT false,
        role text DEFAULT 'user' NOT NULL
      )`,
      `CREATE TABLE libraries (
        id text PRIMARY KEY NOT NULL,
        created_at integer NOT NULL,
        updated_at integer,
        owner_id text NOT NULL,
        name text NOT NULL,
        description text,
        type text NOT NULL,
        scan_schedule text,
        data_sources text NOT NULL
      )`,
      `CREATE TABLE media_items (
        id text PRIMARY KEY NOT NULL,
        created_at integer NOT NULL,
        updated_at integer,
        library_id text NOT NULL,
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
    ])
  })

  afterEach(() => {
    client.close()
  })

  it('returns media from every library owned by the user only', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z')

    await db.insert(users).values([
      {
        id: 'user-1',
        name: 'First User',
        email: 'first@example.com',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-2',
        name: 'Second User',
        email: 'second@example.com',
        createdAt: now,
        updatedAt: now,
      },
    ])

    await db.insert(libraries).values([
      {
        id: 'library-1',
        ownerId: 'user-1',
        name: 'Movies',
        type: 'movie',
        dataSources: [],
        createdAt: now,
      },
      {
        id: 'library-2',
        ownerId: 'user-1',
        name: 'Music',
        type: 'music',
        dataSources: [],
        createdAt: now,
      },
      {
        id: 'library-3',
        ownerId: 'user-2',
        name: 'Other Library',
        type: 'photo',
        dataSources: [],
        createdAt: now,
      },
    ])

    await db.insert(mediaItems).values([
      {
        id: 'media-1',
        libraryId: 'library-1',
        filePath: '/movies/one.mp4',
        fileSize: 100,
        fileMetadata: {},
        mediaType: 'video/mp4',
        title: 'One',
        metadata: {},
        scannedAt: now,
      },
      {
        id: 'media-2',
        libraryId: 'library-2',
        filePath: '/music/two.mp3',
        fileSize: 200,
        fileMetadata: {},
        mediaType: 'audio/mpeg',
        title: 'Two',
        metadata: {},
        scannedAt: now,
      },
      {
        id: 'media-3',
        libraryId: 'library-3',
        filePath: '/photos/three.jpg',
        fileSize: 300,
        fileMetadata: {},
        mediaType: 'image/jpeg',
        title: 'Three',
        metadata: {},
        scannedAt: now,
      },
    ])

    const rows = await getMediaByUser(db, 'user-1')

    expect(rows.map((row) => row.id).sort()).toEqual(['media-1', 'media-2'])
    expect(rows.every((row) => row.libraryId !== 'library-3')).toBe(true)
  })
})
