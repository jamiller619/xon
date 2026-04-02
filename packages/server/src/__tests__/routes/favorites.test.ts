import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { hashPassword } from '../../auth/password.js'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import {
  dataSources,
  favorites,
  libraries,
  mediaItems,
  users,
  watchlist,
} from '../../db/schema.js'
import { signAccessToken } from '../../routes/auth.js'

const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'testuser', 'user')}`
const USER2_AUTH = `Bearer ${await signAccessToken('user-2', 'otheruser', 'user')}`

describe('Favorites and Watchlist API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)

    await db.insert(users).values({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
    })

    await db.insert(users).values({
      id: 'user-2',
      username: 'otheruser',
      email: 'other@example.com',
      displayName: 'Other User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
    })

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Movies', allowedMediaTypes: '[]' })

    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/media',
    })

    await db.insert(mediaItems).values({
      id: 'item-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/movie1.mp4',
      fileName: 'movie1.mp4',
      fileSize: 1000,
    })

    await db.insert(mediaItems).values({
      id: 'item-2',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/movie2.mp4',
      fileName: 'movie2.mp4',
      fileSize: 2000,
    })
  })

  afterEach(() => {
    client.close()
  })

  // ─── Favorites ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/media/:id/favorite', () => {
    it('adds item to favorites and returns 200', async () => {
      const res = await app.request('/api/v1/media/item-1/favorite', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ favorited: true })
    })

    it('is idempotent — adding twice returns 200', async () => {
      await app.request('/api/v1/media/item-1/favorite', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      const res = await app.request('/api/v1/media/item-1/favorite', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown media item', async () => {
      const res = await app.request('/api/v1/media/nonexistent/favorite', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/v1/media/:id/favorite', () => {
    it('removes item from favorites', async () => {
      await db
        .insert(favorites)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      const res = await app.request('/api/v1/media/item-1/favorite', {
        method: 'DELETE',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ favorited: false })
    })

    it('returns 200 even if not previously favorited', async () => {
      const res = await app.request('/api/v1/media/item-1/favorite', {
        method: 'DELETE',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
    })
  })

  describe('GET /api/v1/users/me/favorites', () => {
    it('returns empty array when no favorites', async () => {
      const res = await app.request('/api/v1/users/me/favorites', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })

    it('returns favorited items', async () => {
      await db
        .insert(favorites)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      await db
        .insert(favorites)
        .values({ userId: 'user-1', mediaItemId: 'item-2' })
      const res = await app.request('/api/v1/users/me/favorites', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0]).toHaveProperty('id')
      expect(body[0]).toHaveProperty('thumbnailUrls')
    })

    it("only returns current user's favorites", async () => {
      await db
        .insert(favorites)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      await db
        .insert(favorites)
        .values({ userId: 'user-2', mediaItemId: 'item-2' })
      const res = await app.request('/api/v1/users/me/favorites', {
        headers: { Authorization: USER_AUTH },
      })
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('item-1')
    })
  })

  // ─── Watchlist ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/media/:id/watchlist', () => {
    it('adds item to watchlist and returns 200', async () => {
      const res = await app.request('/api/v1/media/item-1/watchlist', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ watchlisted: true })
    })

    it('is idempotent — adding twice returns 200', async () => {
      await app.request('/api/v1/media/item-1/watchlist', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      const res = await app.request('/api/v1/media/item-1/watchlist', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
    })

    it('returns 404 for unknown media item', async () => {
      const res = await app.request('/api/v1/media/nonexistent/watchlist', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/v1/media/:id/watchlist', () => {
    it('removes item from watchlist', async () => {
      await db
        .insert(watchlist)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      const res = await app.request('/api/v1/media/item-1/watchlist', {
        method: 'DELETE',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ watchlisted: false })
    })
  })

  describe('GET /api/v1/users/me/watchlist', () => {
    it('returns empty array when no watchlist items', async () => {
      const res = await app.request('/api/v1/users/me/watchlist', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })

    it('returns watchlist items', async () => {
      await db
        .insert(watchlist)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      const res = await app.request('/api/v1/users/me/watchlist', {
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('item-1')
    })

    it("only returns current user's watchlist", async () => {
      await db
        .insert(watchlist)
        .values({ userId: 'user-1', mediaItemId: 'item-1' })
      await db
        .insert(watchlist)
        .values({ userId: 'user-2', mediaItemId: 'item-2' })
      const res = await app.request('/api/v1/users/me/watchlist', {
        headers: { Authorization: USER2_AUTH },
      })
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('item-2')
    })
  })
})
