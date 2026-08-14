import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  libraries,
  mediaItems,
  mediaPlayStates,
  users,
} from '../../db/schema.ts'
import { makeMediaRouter } from '../../routes/media.ts'
import { makeUsersRouter } from '../../routes/users.ts'

const USER_ID = 'play-state-user'
const OTHER_USER_ID = 'other-play-state-user'
const MEDIA_ID = 'play-state-media'

describe('media play state routes', () => {
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
      `CREATE TABLE media_play_states (
        user_id text NOT NULL,
        media_item_id text NOT NULL,
        position integer DEFAULT 0 NOT NULL,
        duration integer,
        status text DEFAULT 'playing' NOT NULL,
        started_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
        updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
        stopped_at integer,
        PRIMARY KEY (user_id, media_item_id)
      )`,
    ])

    const now = new Date()
    await db.insert(users).values([
      {
        id: USER_ID,
        name: 'Viewer',
        email: 'viewer@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: OTHER_USER_ID,
        name: 'Other viewer',
        email: 'other-viewer@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(libraries).values({
      id: 'play-state-library',
      ownerId: USER_ID,
      name: 'Movies',
      type: 'movies',
      dataSources: [],
      createdAt: now,
    })
    await db.insert(mediaItems).values({
      id: MEDIA_ID,
      libraryId: 'play-state-library',
      filePath: '/media/movie.mp4',
      fileSize: 100,
      fileMetadata: {},
      mediaType: 'video/mp4',
      title: 'Test Movie',
      metadata: {},
      scannedAt: now,
      createdAt: now,
    })

    app = new Hono().basePath('/api')
    app.use('*', async (c, next) => {
      const userId = c.req.header('x-test-user')
      c.set(
        'user',
        userId
          ? ({
              id: userId,
              name: 'Test viewer',
              email: `${userId}@example.com`,
              emailVerified: true,
              image: null,
              createdAt: now,
              updatedAt: now,
              isAnonymous: false,
            } as never)
          : null,
      )
      c.set('session', userId ? ({ id: 'test-session' } as never) : null)
      await next()
    })
    app.route('/media', makeMediaRouter(db))
    app.route('/users', makeUsersRouter(db))
  })

  afterEach(() => client.close())

  it('creates state immediately and updates the same row when playback stops', async () => {
    const started = await updatePlayState(USER_ID, {
      position: 0,
      duration: 3600,
      status: 'playing',
    })
    expect(started.status).toBe(200)
    expect(await started.json()).toMatchObject({
      mediaItemId: MEDIA_ID,
      position: 0,
      duration: 3600,
      status: 'playing',
      stoppedAt: null,
    })

    const stopped = await updatePlayState(USER_ID, {
      position: 125,
      duration: 3600,
      status: 'stopped',
    })
    expect(stopped.status).toBe(200)

    const rows = await db.select().from(mediaPlayStates)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: USER_ID,
      mediaItemId: MEDIA_ID,
      position: 125,
      status: 'stopped',
    })
    expect(rows[0]?.stoppedAt).toBeInstanceOf(Date)
  })

  it('returns resumable states with media details only for the current user', async () => {
    await updatePlayState(USER_ID, {
      position: 125,
      duration: 3600,
      status: 'stopped',
    })
    await updatePlayState(OTHER_USER_ID, {
      position: 500,
      duration: 3600,
      status: 'playing',
    })

    const response = await app.request('/api/users/me/play-states', {
      headers: { 'x-test-user': USER_ID },
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      position: 125,
      status: 'stopped',
      mediaItem: { id: MEDIA_ID, title: 'Test Movie' },
    })
  })

  it('does not return completed playback on the dashboard route', async () => {
    await updatePlayState(USER_ID, {
      position: 3600,
      duration: 3600,
      status: 'completed',
    })

    const response = await app.request('/api/users/me/play-states', {
      headers: { 'x-test-user': USER_ID },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })

  it('returns compact progress for every current-user play-state row', async () => {
    await updatePlayState(USER_ID, {
      position: 3600,
      duration: 3600,
      status: 'completed',
    })
    await updatePlayState(OTHER_USER_ID, {
      position: 500,
      duration: 3600,
      status: 'playing',
    })

    const response = await app.request('/api/users/me/play-states/progress', {
      headers: { 'x-test-user': USER_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        mediaItemId: MEDIA_ID,
        position: 3600,
        duration: 3600,
        status: 'completed',
      },
    ])
  })

  it('requires authentication and rejects unknown media', async () => {
    const unauthenticated = await app.request(
      `/api/media/${MEDIA_ID}/play-state`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: 0, status: 'playing' }),
      },
    )
    expect(unauthenticated.status).toBe(401)

    const missing = await app.request('/api/media/missing/play-state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': USER_ID,
      },
      body: JSON.stringify({ position: 0, status: 'playing' }),
    })
    expect(missing.status).toBe(404)
  })

  function updatePlayState(
    userId: string,
    body: {
      position: number
      duration: number
      status: 'playing' | 'stopped' | 'completed'
    },
  ): Promise<Response> {
    return app.request(`/api/media/${MEDIA_ID}/play-state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': userId,
      },
      body: JSON.stringify(body),
    })
  }
})
