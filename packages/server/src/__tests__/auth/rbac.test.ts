import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import { signAccessToken } from '../../routes/auth.js'

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`
const MANAGER_AUTH = `Bearer ${await signAccessToken('mgr-1', 'manager', 'manager')}`
const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'user', 'user')}`
const GUEST_AUTH = `Bearer ${await signAccessToken('guest-1', 'guest', 'guest')}`

describe('RBAC middleware', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)
  })

  afterEach(() => {
    client.close()
  })

  // ─── Admin-only routes ───────────────────────────────────────────────────────

  describe('GET /api/v1/admin/users', () => {
    it('allows admin', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: ADMIN_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('rejects manager with 403', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: MANAGER_AUTH },
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toMatch(/admin/)
    })

    it('rejects user with 403', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(403)
    })

    it('rejects guest with 403', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: GUEST_AUTH },
      })
      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/v1/admin/plugins', () => {
    it('allows admin', async () => {
      const res = await app.request('/api/v1/admin/plugins', {
        headers: { Authorization: ADMIN_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('rejects manager with 403', async () => {
      const res = await app.request('/api/v1/admin/plugins', {
        headers: { Authorization: MANAGER_AUTH },
      })
      expect(res.status).toBe(403)
    })
  })

  // ─── Manager-only routes ─────────────────────────────────────────────────────

  describe('POST /api/v1/libraries', () => {
    const body = JSON.stringify({ name: 'Test Library' })
    const headers = (auth: string) => ({
      'Content-Type': 'application/json',
      Authorization: auth,
    })

    it('allows admin to create library', async () => {
      const res = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: headers(ADMIN_AUTH),
        body,
      })
      expect(res.status).toBe(201)
    })

    it('allows manager to create library', async () => {
      const res = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: headers(MANAGER_AUTH),
        body,
      })
      expect(res.status).toBe(201)
    })

    it('rejects user with 403', async () => {
      const res = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: headers(USER_AUTH),
        body,
      })
      expect(res.status).toBe(403)
      const resBody = await res.json()
      expect(resBody.error).toMatch(/manager/)
    })

    it('rejects guest with 403', async () => {
      const res = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: headers(GUEST_AUTH),
        body,
      })
      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/v1/libraries/:id', () => {
    it('allows manager to delete library', async () => {
      // Create library first
      const createRes = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: MANAGER_AUTH,
        },
        body: JSON.stringify({ name: 'To Delete' }),
      })
      const lib = await createRes.json()

      const res = await app.request(`/api/v1/libraries/${lib.id}`, {
        method: 'DELETE',
        headers: { Authorization: MANAGER_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('rejects user with 403 on delete', async () => {
      const res = await app.request('/api/v1/libraries/some-id', {
        method: 'DELETE',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(403)
    })
  })

  // ─── Read-only access for guests ─────────────────────────────────────────────

  describe('GET /api/v1/libraries (read access)', () => {
    it('allows guest to read libraries', async () => {
      const res = await app.request('/api/v1/libraries', {
        headers: { Authorization: GUEST_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('allows user to read libraries', async () => {
      const res = await app.request('/api/v1/libraries', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
    })
  })

  // ─── Role hierarchy ──────────────────────────────────────────────────────────

  describe('role hierarchy: admin > manager > user > guest', () => {
    it('admin can access manager routes', async () => {
      const res = await app.request('/api/v1/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ADMIN_AUTH,
        },
        body: JSON.stringify({ name: 'Admin Library' }),
      })
      expect(res.status).toBe(201)
    })

    it('manager cannot access admin routes', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: MANAGER_AUTH },
      })
      expect(res.status).toBe(403)
    })
  })
})
