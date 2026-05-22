import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import { dataSources, libraries, mediaItems } from '../../db/schema.js'
import { signAccessToken } from '../../routes/auth.js'

const AUTH = `Bearer ${await signAccessToken('test-id', 'testuser', 'admin')}`

describe('Libraries CRUD API', () => {
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

  // Helper to create a library
  async function createLibrary(
    data: { name: string; description?: string; mediaTypes?: string[] } = {
      name: 'Test Library',
    },
  ) {
    return app.request('/api/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify(data),
    })
  }

  describe('POST /api/libraries', () => {
    it('creates a library and returns 201', async () => {
      const res = await createLibrary({
        name: 'My Movies',
        description: 'Movie collection',
        mediaTypes: ['Movies'],
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toMatchObject({
        name: 'My Movies',
        description: 'Movie collection',
        mediaTypes: '["Movies"]',
      })
      expect(body).toHaveProperty('id')
      expect(body).toHaveProperty('createdAt')
    })

    it('creates a library with defaults for optional fields', async () => {
      const res = await createLibrary({ name: 'Minimal Library' })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('Minimal Library')
      expect(body.mediaTypes).toBe('[]')
      expect(body.description).toBeNull()
    })

    it('returns 400 for missing name', async () => {
      const res = await app.request('/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ description: 'no name' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for empty name', async () => {
      const res = await app.request('/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ name: '' }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/libraries', () => {
    it('returns empty array when no libraries exist', async () => {
      const res = await app.request('/api/libraries', {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })

    it('lists all libraries', async () => {
      await createLibrary({ name: 'Library 1' })
      await createLibrary({ name: 'Library 2' })
      const res = await app.request('/api/libraries', {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body.map((l: { name: string }) => l.name)).toContain('Library 1')
      expect(body.map((l: { name: string }) => l.name)).toContain('Library 2')
    })
  })

  describe('GET /api/libraries/:id', () => {
    it('returns library with empty dataSources array', async () => {
      const created = await (
        await createLibrary({ name: 'Detail Library' })
      ).json()
      const res = await app.request(`/api/libraries/${created.id}`, {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(created.id)
      expect(body.name).toBe('Detail Library')
      expect(body.dataSources).toEqual([])
    })

    it('returns 404 for unknown id', async () => {
      const res = await app.request('/api/libraries/nonexistent', {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/libraries/:id', () => {
    it('updates library name', async () => {
      const created = await (await createLibrary({ name: 'Old Name' })).json()
      const res = await app.request(`/api/libraries/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ name: 'New Name' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('New Name')
    })

    it('updates mediaTypes', async () => {
      const created = await (await createLibrary({ name: 'Library' })).json()
      const res = await app.request(`/api/libraries/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ mediaTypes: ['Movies', 'TV Shows'] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.mediaTypes).toBe('["Movies","TV Shows"]')
    })

    it('returns 404 for unknown id', async () => {
      const res = await app.request('/api/libraries/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ name: 'Updated' }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/libraries/:id', () => {
    it('deletes a library and returns success', async () => {
      const created = await (await createLibrary({ name: 'To Delete' })).json()
      const res = await app.request(`/api/libraries/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it('deleted library is no longer found', async () => {
      const created = await (await createLibrary({ name: 'Gone' })).json()
      await app.request(`/api/libraries/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      })
      const res = await app.request(`/api/libraries/${created.id}`, {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 for unknown id', async () => {
      const res = await app.request('/api/libraries/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(404)
    })
  })
})

describe('Libraries Media List API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>
  let libId: string
  let sourceId: string

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)

    libId = crypto.randomUUID()
    const now = new Date()
    await db.insert(libraries).values({
      id: libId,
      name: 'Test Library',
      mediaTypes: '[]',
      createdAt: now,
      updatedAt: now,
    })

    sourceId = crypto.randomUUID()
    await db.insert(dataSources).values({
      id: sourceId,
      libraryId: libId,
      type: 'local',
      path: '/media',
      recursive: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    // Insert 3 test media items
    for (let i = 0; i < 3; i++) {
      await db.insert(mediaItems).values({
        id: crypto.randomUUID(),
        libraryId: libId,
        dataSourceId: sourceId,
        filePath: `/media/file${i}.jpg`,
        fileName: `file${i}.jpg`,
        fileSize: 1000 * (i + 1),
        mimeType: 'image/jpeg',
        mediaCategory: 'Pictures',
        createdAt: now,
        updatedAt: now,
      })
    }
  })

  afterEach(() => {
    client.close()
  })

  describe('GET /api/libraries/:libraryId/media', () => {
    it('returns all media items for the library', async () => {
      const res = await app.request(`/api/libraries/${libId}/media`, {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(3)
    })

    it('includes thumbnailUrls field on each item', async () => {
      const res = await app.request(`/api/libraries/${libId}/media`, {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body[0]).toHaveProperty('thumbnailUrls')
    })

    it('returns 404 for unknown library', async () => {
      const res = await app.request('/api/libraries/nonexistent/media', {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(404)
    })

    it('filters by mediaCategory', async () => {
      // Add a non-picture item
      const now = new Date()
      await db.insert(mediaItems).values({
        id: crypto.randomUUID(),
        libraryId: libId,
        dataSourceId: sourceId,
        filePath: '/media/doc.pdf',
        fileName: 'doc.pdf',
        fileSize: 500,
        mimeType: 'application/pdf',
        mediaCategory: 'Documents',
        createdAt: now,
        updatedAt: now,
      })

      const res = await app.request(
        `/api/libraries/${libId}/media?mediaCategory=Documents`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].mediaCategory).toBe('Documents')
    })

    it('filters by mimeType', async () => {
      const res = await app.request(
        `/api/libraries/${libId}/media?mimeType=image/jpeg`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(3)
    })

    it('filters by drmProtected=false', async () => {
      const res = await app.request(
        `/api/libraries/${libId}/media?drmProtected=false`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(3)
    })

    it('paginates results with page and limit', async () => {
      const res = await app.request(
        `/api/libraries/${libId}/media?limit=2&page=1`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)

      const res2 = await app.request(
        `/api/libraries/${libId}/media?limit=2&page=2`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res2.status).toBe(200)
      const body2 = await res2.json()
      expect(body2).toHaveLength(1)
    })

    it('sorts by fileSize', async () => {
      const res = await app.request(
        `/api/libraries/${libId}/media?sortBy=fileSize&order=desc`,
        {
          headers: { Authorization: AUTH },
        },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body[0].fileSize).toBe(3000)
      expect(body[2].fileSize).toBe(1000)
    })

    it('returns empty array when library has no media', async () => {
      const emptyLibId = crypto.randomUUID()
      const now = new Date()
      await db.insert(libraries).values({
        id: emptyLibId,
        name: 'Empty Library',
        mediaTypes: '[]',
        createdAt: now,
        updatedAt: now,
      })
      const res = await app.request(`/api/libraries/${emptyLibId}/media`, {
        headers: { Authorization: AUTH },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(0)
    })
  })
})
