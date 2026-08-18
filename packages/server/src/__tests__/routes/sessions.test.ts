import { unlink } from 'node:fs/promises'
import { type Client, createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessions } from '../../db/schema.ts'
import { makeSessionsRouter } from '../../routes/sessions.ts'
import {
  captureSessionClientName,
  SESSION_ACTIVITY_WINDOW_MS,
  touchSessionActivity,
} from '../../services/sessionService.ts'

vi.mock('../../lib/auth.ts', () => ({ default: {} }))

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('Sessions API', () => {
  let client: Client
  let db: LibSQLDatabase
  let databasePath: string

  beforeEach(async () => {
    databasePath = `/tmp/xon-sessions-${crypto.randomUUID()}.db`
    client = createClient({ url: `file:${databasePath}` })
    db = drizzle(client)
    await client.executeMultiple(`
      CREATE TABLE sessions (
        id text PRIMARY KEY NOT NULL,
        expires_at integer NOT NULL,
        token text NOT NULL UNIQUE,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        last_seen_at integer NOT NULL,
        client_name text,
        ip_address text,
        user_agent text,
        user_id text NOT NULL
      );
      CREATE INDEX sessions_userId_idx ON sessions (user_id);
    `)

    const now = Date.now()
    await db
      .insert(sessions)
      .values([
        sessionRow(
          'current',
          'user-1',
          now - 60 * 60 * 1000,
          now + 86_400_000,
          'Chrome - Web',
        ),
        sessionRow('other', 'user-1', now - 10 * 60 * 1000, now + 86_400_000),
        sessionRow('expired', 'user-1', now - 1000, now - 1),
        sessionRow('foreign', 'user-2', now - 1000, now + 86_400_000),
      ])
  })

  afterEach(async () => {
    client.close()
    await unlink(databasePath).catch(() => undefined)
  })

  function makeApp(userId: string | null = 'user-1', sessionId = 'current') {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user', userId ? ({ id: userId } as never) : null)
      c.set('session', userId ? ({ id: sessionId } as never) : null)
      await next()
    })
    app.route('/sessions', makeSessionsRouter(db))
    return app
  }

  it('lists only active owned sessions with the current session first', async () => {
    const response = await makeApp().request('/sessions')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = (await response.json()) as Array<Record<string, unknown>>
    expect(body).toHaveLength(2)
    expect(body.map(({ id }) => id)).toEqual(['current', 'other'])
    expect(body[0]).toMatchObject({
      id: 'current',
      isCurrent: true,
      clientName: 'Chrome - Web',
      ipAddress: '192.0.2.10',
      device: {
        type: 'desktop',
        label: 'Windows · Chrome',
        browser: 'Chrome',
        operatingSystem: 'Windows',
      },
    })
    expect(body[0]).not.toHaveProperty('token')
    expect(body[0]).not.toHaveProperty('userId')
    expect(body[0]).not.toHaveProperty('userAgent')
  })

  it('requires authentication to list or revoke sessions', async () => {
    const app = makeApp(null)

    expect((await app.request('/sessions')).status).toBe(401)
    expect(
      (await app.request('/sessions/other', { method: 'DELETE' })).status,
    ).toBe(401)
  })

  it('revokes one owned non-current session', async () => {
    const response = await makeApp().request('/sessions/other', {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(
      await db.select().from(sessions).where(eq(sessions.id, 'other')),
    ).toHaveLength(0)
  })

  it('does not distinguish foreign and missing sessions', async () => {
    const app = makeApp()
    const foreign = await app.request('/sessions/foreign', {
      method: 'DELETE',
    })
    const missing = await app.request('/sessions/missing', {
      method: 'DELETE',
    })

    expect(foreign.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await foreign.json()).toEqual(await missing.json())
  })

  it('rejects revoking the current session', async () => {
    const response = await makeApp().request('/sessions/current', {
      method: 'DELETE',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'current_session',
        message: 'The current session cannot be revoked here',
      },
    })
  })

  it('shows all sessions attached to the shared anonymous user', async () => {
    const now = Date.now()
    await db
      .insert(sessions)
      .values([
        sessionRow('guest-current', 'guest', now - 2000, now + 86_400_000),
        sessionRow('guest-other', 'guest', now - 1000, now + 86_400_000),
      ])

    const response = await makeApp('guest', 'guest-current').request(
      '/sessions',
    )
    const body = (await response.json()) as Array<{ id: string }>

    expect(body.map(({ id }) => id)).toEqual(['guest-current', 'guest-other'])
  })

  it('updates activity only after the five-minute threshold', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const recent = new Date(now.getTime() - SESSION_ACTIVITY_WINDOW_MS + 1)
    await db
      .update(sessions)
      .set({ lastSeenAt: recent })
      .where(eq(sessions.id, 'other'))

    await touchSessionActivity(db, 'other', now)
    let row = await db
      .select({ lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(eq(sessions.id, 'other'))
      .get()
    expect(row?.lastSeenAt).toEqual(recent)

    const stale = new Date(now.getTime() - SESSION_ACTIVITY_WINDOW_MS)
    await db
      .update(sessions)
      .set({ lastSeenAt: stale })
      .where(eq(sessions.id, 'other'))

    await touchSessionActivity(db, 'other', now)
    row = await db
      .select({ lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(eq(sessions.id, 'other'))
      .get()
    expect(row?.lastSeenAt).toEqual(now)
  })

  it('captures a client name once for an existing session', async () => {
    await captureSessionClientName(db, 'other', ' Chrome   - Web ')
    await captureSessionClientName(db, 'other', 'Replacement')

    const row = await db
      .select({ clientName: sessions.clientName })
      .from(sessions)
      .where(eq(sessions.id, 'other'))
      .get()
    expect(row?.clientName).toBe('Chrome - Web')
  })
})

function sessionRow(
  id: string,
  userId: string,
  lastSeenAt: number,
  expiresAt: number,
  clientName?: string,
) {
  const createdAt = new Date(lastSeenAt - 1000)
  return {
    id,
    token: `token-${id}`,
    userId,
    clientName,
    ipAddress: '192.0.2.10',
    userAgent: CHROME_WINDOWS,
    createdAt,
    updatedAt: createdAt,
    lastSeenAt: new Date(lastSeenAt),
    expiresAt: new Date(expiresAt),
  }
}
