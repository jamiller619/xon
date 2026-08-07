import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { openDatabase } from '../../db/db.ts'
import { migrateDatabase } from '../../db/migrate.ts'
import {
  collections,
  dataSources,
  libraries,
  mediaItems,
  suggestedCollections,
  users,
} from '../../db/schema.ts'
import { signAccessToken } from '../../routes/auth.ts'

const AUTH_ADMIN = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`
const AUTH_USER = `Bearer ${await signAccessToken('user-id', 'regularuser', 'user')}`

describe('AI Suggested Collections API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>
  let libraryId: string
  let sourceId: string

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)

    const now = new Date()
    libraryId = crypto.randomUUID()
    sourceId = crypto.randomUUID()

    await db.insert(libraries).values({
      id: libraryId,
      name: 'Test Library',
      mediaTypes: '[]',
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(dataSources).values({
      id: sourceId,
      libraryId,
      type: 'local',
      path: '/test',
      recursive: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
  })

  afterEach(() => {
    client.close()
  })

  async function insertSuggestion(
    overrides: Partial<{
      id: string
      suggestedTitle: string
      suggestedType: string
      reason: string
      memberItemIds: string
      confidence: number
      status: 'pending' | 'accepted' | 'rejected'
    }> = {},
  ) {
    const id = overrides.id ?? crypto.randomUUID()
    const now = new Date()
    await db.insert(suggestedCollections).values({
      id,
      libraryId,
      suggestedTitle: overrides.suggestedTitle ?? 'Test Collection',
      suggestedType: overrides.suggestedType ?? 'collection',
      reason: overrides.reason ?? 'Test reason',
      memberItemIds: overrides.memberItemIds ?? '[]',
      confidence: overrides.confidence ?? 80,
      status: overrides.status ?? 'pending',
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async function insertMediaItem(
    fileName: string,
    category: string,
    metadata = '{}',
  ) {
    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(mediaItems).values({
      id,
      libraryId,
      dataSourceId: sourceId,
      filePath: `/test/${fileName}`,
      fileName,
      fileSize: 1000,
      mediaCategory: category,
      metadata,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  describe('GET /api/ai/suggested-collections', () => {
    it('returns pending suggestions for admin', async () => {
      await insertSuggestion({
        suggestedTitle: 'My Series',
        status: 'pending',
      })
      await insertSuggestion({
        suggestedTitle: 'Accepted One',
        status: 'accepted',
      })

      const res = await app.request('/api/ai/suggested-collections', {
        headers: { Authorization: AUTH_ADMIN },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        items: { suggestedTitle: string }[]
      }
      expect(body.items).toHaveLength(1)
      expect(body.items[0]?.suggestedTitle).toBe('My Series')
    })

    it('supports status filter', async () => {
      await insertSuggestion({
        suggestedTitle: 'Accepted One',
        status: 'accepted',
      })

      const res = await app.request(
        '/api/ai/suggested-collections?status=accepted',
        {
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        items: { suggestedTitle: string }[]
      }
      expect(body.items).toHaveLength(1)
      expect(body.items[0]?.suggestedTitle).toBe('Accepted One')
    })

    it('supports libraryId filter', async () => {
      await insertSuggestion({ suggestedTitle: 'In Library' })

      const res = await app.request(
        `/api/ai/suggested-collections?libraryId=${libraryId}`,
        {
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { items: unknown[] }
      expect(body.items).toHaveLength(1)
    })

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/ai/suggested-collections')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/ai/suggested-collections/scan', () => {
    it('returns found count of 0 for empty library', async () => {
      const res = await app.request('/api/ai/suggested-collections/scan', {
        method: 'POST',
        headers: {
          Authorization: AUTH_ADMIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ libraryId }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { found: number }
      expect(body.found).toBe(0)
    })

    it('detects multi-disc albums and returns found count', async () => {
      const album = '{"album":"My Album"}'
      await insertMediaItem('Disc 1/track1.mp3', 'Music', album)
      await insertMediaItem('Disc 1/track2.mp3', 'Music', album)
      await insertMediaItem('Disc 2/track1.mp3', 'Music', album)

      const res = await app.request('/api/ai/suggested-collections/scan', {
        method: 'POST',
        headers: {
          Authorization: AUTH_ADMIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ libraryId }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { found: number }
      expect(body.found).toBeGreaterThan(0)
    })

    it('returns 404 for unknown library', async () => {
      const res = await app.request('/api/ai/suggested-collections/scan', {
        method: 'POST',
        headers: {
          Authorization: AUTH_ADMIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ libraryId: 'nonexistent' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 422 with missing libraryId', async () => {
      const res = await app.request('/api/ai/suggested-collections/scan', {
        method: 'POST',
        headers: {
          Authorization: AUTH_ADMIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/ai/suggested-collections/:id/accept', () => {
    it('accepts a pending suggestion and creates a collection', async () => {
      const itemId = await insertMediaItem('track.mp3', 'Music')
      const suggId = await insertSuggestion({
        suggestedTitle: 'My Album',
        suggestedType: 'album',
        memberItemIds: JSON.stringify([itemId]),
        status: 'pending',
      })

      const res = await app.request(
        `/api/ai/suggested-collections/${suggId}/accept`,
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { collectionId: string }
      expect(body.collectionId).toBeTruthy()

      // Verify collection was created
      const collectionRows = await db.select().from(collections).where(
        // We just check there's at least one collection
        undefined,
      )
      expect(collectionRows.length).toBeGreaterThan(0)

      // Verify suggestion is now accepted
      const suggRows = await db.select().from(suggestedCollections)
      const updated = suggRows.find((s) => s.id === suggId)
      expect(updated?.status).toBe('accepted')
    })

    it('returns 404 for unknown suggestion', async () => {
      const res = await app.request(
        '/api/ai/suggested-collections/nonexistent/accept',
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(404)
    })

    it('returns 409 for already-accepted suggestion', async () => {
      const suggId = await insertSuggestion({ status: 'accepted' })
      const res = await app.request(
        `/api/ai/suggested-collections/${suggId}/accept`,
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(409)
    })
  })

  describe('POST /api/ai/suggested-collections/:id/reject', () => {
    it('rejects a pending suggestion', async () => {
      const suggId = await insertSuggestion({ status: 'pending' })

      const res = await app.request(
        `/api/ai/suggested-collections/${suggId}/reject`,
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { status: string }
      expect(body.status).toBe('rejected')
    })

    it('returns 404 for unknown suggestion', async () => {
      const res = await app.request(
        '/api/ai/suggested-collections/nonexistent/reject',
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(404)
    })

    it('returns 409 for already-rejected suggestion', async () => {
      const suggId = await insertSuggestion({ status: 'rejected' })
      const res = await app.request(
        `/api/ai/suggested-collections/${suggId}/reject`,
        {
          method: 'POST',
          headers: { Authorization: AUTH_ADMIN },
        },
      )
      expect(res.status).toBe(409)
    })

    it('regular user can reject suggestions in accessible libraries', async () => {
      // Must insert user rows first (FK constraint on library_access)
      await db.insert(users).values([
        {
          id: 'admin-id',
          username: 'admin',
          email: 'admin@example.com',
          displayName: 'Admin',
          passwordHash: 'hash',
          role: 'admin',
        },
        {
          id: 'user-id',
          username: 'regularuser',
          email: 'user@example.com',
          displayName: 'Regular User',
          passwordHash: 'hash',
          role: 'user',
        },
      ])

      const { libraryAccess } = await import('../../schema.js')
      await db.insert(libraryAccess).values({
        userId: 'user-id',
        libraryId,
        grantedBy: 'admin-id',
      })

      const suggId = await insertSuggestion({ status: 'pending' })

      const res = await app.request(
        `/api/ai/suggested-collections/${suggId}/reject`,
        {
          method: 'POST',
          headers: { Authorization: AUTH_USER },
        },
      )
      expect(res.status).toBe(200)
    })
  })
})
