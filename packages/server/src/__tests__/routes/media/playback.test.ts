import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaPlayStates } from '../../../db/schema.ts'
import { makeMediaPlaybackRouter } from '../../../routes/media/playback.ts'

const USER_ID = 'play-state-user'
const MEDIA_ID = 'play-state-media'

describe('media playback routes', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: Hono

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await client.batch([
      `CREATE TABLE media_items (id text PRIMARY KEY NOT NULL)`,
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
      `INSERT INTO media_items (id) VALUES ('${MEDIA_ID}')`,
    ])

    app = new Hono()
      .use('*', async (c, next) => {
        const authenticated = Boolean(c.req.header('x-test-user'))
        c.set('user', authenticated ? ({ id: USER_ID } as never) : null)
        c.set(
          'session',
          authenticated ? ({ id: 'test-session' } as never) : null,
        )
        await next()
      })
      .route('/media', makeMediaPlaybackRouter(db))
  })

  afterEach(() => client.close())

  it('creates and updates one play-state row', async () => {
    const started = await request({
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

    const stopped = await request({
      position: 125.9,
      duration: 3600.8,
      status: 'stopped',
    })
    expect(stopped.status).toBe(200)

    const rows = await db.select().from(mediaPlayStates)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: USER_ID,
      mediaItemId: MEDIA_ID,
      position: 125,
      duration: 3600,
      status: 'stopped',
    })
    expect(rows[0]?.stoppedAt).toBeInstanceOf(Date)
  })

  it('requires authentication and rejects unknown media', async () => {
    const unauthenticated = await app.request(`/media/${MEDIA_ID}/play-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 0, status: 'playing' }),
    })
    expect(unauthenticated.status).toBe(401)

    const missing = await app.request('/media/missing/play-state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': USER_ID,
      },
      body: JSON.stringify({ position: 0, status: 'playing' }),
    })
    expect(missing.status).toBe(404)
  })

  function request(body: {
    position: number
    duration: number
    status: 'playing' | 'stopped' | 'completed'
  }) {
    return app.request(`/media/${MEDIA_ID}/play-state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': USER_ID,
      },
      body: JSON.stringify(body),
    })
  }
})
