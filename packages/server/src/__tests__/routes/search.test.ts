import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../db/migrate.ts'
import { libraries, mediaItems, users } from '../../db/schema.ts'
import { makeSearchRouter } from '../../routes/search.ts'
import { searchMedia, toFtsQuery } from '../../services/searchService.ts'

vi.mock('../../lib/auth.ts', () => ({ default: {} }))

describe('Search API', () => {
  let client: Client
  let db: LibSQLDatabase
  let databaseDirectory: string
  let user1Id: number
  let user2Id: number

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-search-test-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'search.db')).href,
    })
    db = drizzle(client)
    await migrateDatabase(db)

    const insertedUsers = await db
      .insert(users)
      .values([
        {
          publicId: 'user-1',
          name: 'First User',
          email: 'first@example.com',
        },
        {
          publicId: 'user-2',
          name: 'Second User',
          email: 'second@example.com',
        },
      ])
      .returning({ id: users.id, publicId: users.publicId })
    const firstUser = insertedUsers.find((user) => user.publicId === 'user-1')
    const secondUser = insertedUsers.find((user) => user.publicId === 'user-2')
    if (!firstUser || !secondUser) throw new Error('Failed to seed users')
    user1Id = firstUser.id
    user2Id = secondUser.id

    const insertedLibraries = await db
      .insert(libraries)
      .values([
        {
          publicId: 'library-1',
          ownerId: user1Id,
          name: 'First Movies',
          type: 'video/movie',
          dataSources: [],
        },
        {
          publicId: 'library-2',
          ownerId: user2Id,
          name: 'Second Movies',
          type: 'video/movie',
          dataSources: [],
        },
        {
          publicId: 'library-music',
          ownerId: user1Id,
          name: 'First Music',
          type: 'audio',
          dataSources: [],
        },
      ])
      .returning({ id: libraries.id, publicId: libraries.publicId })
    const libraryId = (publicId: string) => {
      const library = insertedLibraries.find((row) => row.publicId === publicId)
      if (!library) throw new Error(`Failed to seed ${publicId}`)
      return library.id
    }
    await db.insert(mediaItems).values([
      {
        publicId: 'arrival-title',
        libraryId: libraryId('library-1'),
        filePath: '/movies/arrival.mkv',
        fileSize: 1024,
        fileMetadata: {},
        mediaType: 'video/x-matroska',
        title: 'Arrival',
        description: 'First contact drama',
        metadata: {
          genres: ['Science Fiction', 'Drama', 'Metadata Only'],
          cast: [{ name: 'Amy Adams', character: 'Louise Banks' }],
          crew: [{ name: 'Denis Villeneuve', job: 'Director' }],
        },
        scannedAt: new Date(),
        tags: ['genre:science-fiction', 'genre:drama'],
      },
      {
        publicId: 'arrival-description',
        libraryId: libraryId('library-1'),
        filePath: '/movies/other.mkv',
        fileSize: 2048,
        fileMetadata: {},
        mediaType: 'video/x-matroska',
        title: 'Another Film',
        description: 'An arrival changes everything',
        metadata: { genres: ['drama', 'Comedy', 'Drama'] },
        scannedAt: new Date(),
        tags: ['genre:---'],
      },
      {
        publicId: 'contact-soundtrack',
        libraryId: libraryId('library-music'),
        filePath: '/music/contact.flac',
        fileSize: 8192,
        fileMetadata: {},
        mediaType: 'audio/flac',
        title: 'First Encounter',
        description: null,
        metadata: {
          album: 'Contact',
          artists: [{ name: 'Jóhann Jóhannsson' }],
          genre: 'Ambient',
        },
        scannedAt: new Date(),
        tags: [],
      },
      {
        publicId: 'arrival-private',
        libraryId: libraryId('library-2'),
        filePath: '/private/arrival.mkv',
        fileSize: 4096,
        fileMetadata: {},
        mediaType: 'video/x-matroska',
        title: 'Arrival Private Copy',
        description: null,
        metadata: { genres: ['Science Fiction', 'Private'] },
        scannedAt: new Date(),
        tags: [],
      },
    ])
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  function makeApp(userId?: number) {
    const app = new Hono()
    if (userId) {
      app.use('*', async (c, next) => {
        c.set('user', { id: userId } as never)
        c.set('session', { id: 'test-session' } as never)
        await next()
      })
    }
    return app.route('/search', makeSearchRouter(db))
  }

  it('treats user input as literal prefix terms instead of FTS syntax', () => {
    expect(toFtsQuery('  Arrival OR "private" -- copy  ')).toBe(
      '"Arrival"* AND "OR"* AND "private"* AND "copy"*',
    )
    expect(toFtsQuery('---')).toBeNull()
  })

  it('ranks a title match ahead of a description match', async () => {
    const results = await searchMedia(db, {
      userId: user1Id,
      query: 'arrival',
      page: 1,
      limit: 20,
    })

    expect(results.total).toBe(2)
    expect(results.data.map((item) => item.id)).toEqual([
      'arrival-title',
      'arrival-description',
    ])
  })

  it('supports prefix search', async () => {
    const results = await searchMedia(db, {
      userId: user1Id,
      query: 'arriv',
      page: 1,
      limit: 20,
    })

    expect(results.total).toBe(2)
  })

  it('matches nested metadata values, including cast', async () => {
    const results = await searchMedia(db, {
      userId: user1Id,
      query: 'Amy Villeneuve science',
      page: 1,
      limit: 20,
    })

    expect(results.data.map((item) => item.id)).toEqual(['arrival-title'])
  })

  it('filters results by the owning library content type', async () => {
    const allResults = await searchMedia(db, {
      userId: user1Id,
      query: 'contact',
      page: 1,
      limit: 20,
    })
    const musicResults = await searchMedia(db, {
      userId: user1Id,
      query: 'contact',
      category: 'audio',
      page: 1,
      limit: 20,
    })

    expect(allResults.total).toBe(2)
    expect(musicResults.total).toBe(1)
    expect(musicResults.data.map((item) => item.id)).toEqual([
      'contact-soundtrack',
    ])
  })

  it("never returns media from another user's libraries", async () => {
    const firstUser = await searchMedia(db, {
      userId: user1Id,
      query: 'private',
      page: 1,
      limit: 20,
    })
    const secondUser = await searchMedia(db, {
      userId: user2Id,
      query: 'private',
      page: 1,
      limit: 20,
    })

    expect(firstUser.data).toEqual([])
    expect(secondUser.data.map((item) => item.id)).toEqual(['arrival-private'])
  })

  it('requires authentication', async () => {
    const response = await makeApp().request('/search?q=arrival')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('requires authentication for popular genres', async () => {
    const response = await makeApp().request('/search/genres')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('validates the query', async () => {
    const response = await makeApp(user1Id).request('/search')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('validates the popular genre limit', async () => {
    const response = await makeApp(user1Id).request('/search/genres?limit=0')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('returns the most-used genres from the current user libraries', async () => {
    const response = await makeApp(user1Id).request('/search/genres?limit=3')

    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toBeTruthy()
    await expect(response.json()).resolves.toEqual([
      { name: 'Drama', count: 2 },
      { name: 'Ambient', count: 1 },
      { name: 'Comedy', count: 1 },
    ])
  })

  it('does not count legacy metadata when an item has canonical genre tags', async () => {
    const response = await makeApp(user1Id).request('/search/genres?limit=20')

    expect(response.status).toBe(200)
    const genres = (await response.json()) as Array<{ name: string }>
    expect(genres.map((genre) => genre.name)).not.toContain('Metadata Only')
  })

  it('returns MediaItem rows with pagination and cache headers', async () => {
    const response = await makeApp(user1Id).request(
      '/search?q=arrival&page=1&limit=1',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Total-Count')).toBe('2')
    expect(response.headers.get('X-Page')).toBe('1')
    expect(response.headers.get('X-Page-Size')).toBe('1')
    expect(response.headers.get('X-Total-Pages')).toBe('2')
    expect(response.headers.get('ETag')).toBeTruthy()
    await expect(response.json()).resolves.toMatchObject([
      {
        id: 'arrival-title',
        libraryId: 'library-1',
        title: 'Arrival',
        tags: ['genre:science-fiction', 'genre:drama'],
      },
    ])
  })

  it('paginates in stable relevance order', async () => {
    const response = await makeApp(user1Id).request(
      '/search?q=arrival&page=2&limit=1',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Page')).toBe('2')
    await expect(response.json()).resolves.toMatchObject([
      { id: 'arrival-description' },
    ])
  })

  it('accepts a category and includes it in pagination results', async () => {
    const response = await makeApp(user1Id).request(
      '/search?q=contact&category=audio&page=1&limit=20',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Total-Count')).toBe('1')
    await expect(response.json()).resolves.toMatchObject([
      { id: 'contact-soundtrack', libraryId: 'library-music' },
    ])
  })
})
