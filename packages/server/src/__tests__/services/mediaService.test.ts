import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  libraries,
  mediaItems,
  people,
  peopleMedia,
  users,
} from '../../db/schema.ts'
import { getMediaByUser, getRelatedMedia } from '../../services/mediaService.ts'

describe('mediaService', () => {
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
        name text NOT NULL UNIQUE,
        description text,
        avatar_url text,
        metadata text DEFAULT '{}' NOT NULL
      )`,
      `CREATE TABLE people_media (
        id text PRIMARY KEY NOT NULL,
        person_id text NOT NULL,
        media_id text NOT NULL,
        role text NOT NULL,
        "order" integer,
        UNIQUE(person_id, media_id, role)
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

  it('balances unique shared people and genres across related media', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z')

    await db.insert(users).values({
      id: 'user-1',
      name: 'User',
      email: 'user@example.com',
      createdAt: now,
      updatedAt: now,
    })
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
        name: 'Other Movies',
        type: 'movie',
        dataSources: [],
        createdAt: now,
      },
    ])

    const media = (
      id: string,
      libraryId: string,
      genres: string[],
      voteAverage: number,
      peopleMetadata: Record<string, unknown> = {},
    ) => ({
      id,
      libraryId,
      filePath: `/movies/${id}.mp4`,
      fileSize: 100,
      fileMetadata: {},
      mediaType: 'video/mp4',
      title: id,
      metadata: { genres, voteAverage, ...peopleMetadata },
      scannedAt: now,
      createdAt: now,
    })

    await db.insert(mediaItems).values([
      media('source', 'library-1', ['Drama', 'Comedy'], 8, {
        writers: ['Hunter S. Thompson'],
        directors: ['Terry Gilliam'],
      }),
      media('shared-metadata-people', 'library-1', [], 4, {
        actors: ['Hunter S. Thompson'],
        crew: [{ id: 280, name: 'Terry Gilliam', job: 'Director' }],
      }),
      media('shared-cast', 'library-1', ['Drama'], 5),
      media('shared-genres', 'library-1', ['drama', 'Comedy', 'Comedy'], 6),
      media('rating-tiebreak', 'library-1', ['Drama'], 9),
      media('genre-only', 'library-1', ['Drama'], 7),
      media('unrelated', 'library-1', ['Horror'], 10),
      media('other-library', 'library-2', ['Drama', 'Comedy'], 10),
    ])

    await db.insert(people).values({
      id: 'person-1',
      name: 'Actor',
      metadata: {},
    })
    await db.insert(peopleMedia).values([
      {
        id: 'credit-source',
        personId: 'person-1',
        mediaId: 'source',
        role: 'Lead',
      },
      {
        id: 'credit-related-1',
        personId: 'person-1',
        mediaId: 'shared-cast',
        role: 'First role',
      },
      {
        id: 'credit-related-2',
        personId: 'person-1',
        mediaId: 'shared-cast',
        role: 'Second role',
      },
    ])

    const rows = await getRelatedMedia(db, 'source')

    expect(rows.map((row) => row.id)).toEqual([
      'shared-metadata-people',
      'shared-genres',
      'shared-cast',
      'rating-tiebreak',
      'genre-only',
    ])
    expect(rows.every((row) => row.id !== 'source')).toBe(true)
    expect(rows[0]).toHaveProperty('matchId')
    expect(rows[0]).toHaveProperty('matchIdSource')
    expect(
      (await getRelatedMedia(db, 'source', 2)).map((row) => row.id),
    ).toEqual(['shared-metadata-people', 'shared-genres'])
    expect(await getRelatedMedia(db, 'source', 0)).toEqual([])
  })

  it('returns no results for an unknown source', async () => {
    expect(await getRelatedMedia(db, 'missing')).toEqual([])
  })
})
