import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../db/migrate.ts'
import { libraries, mediaItems, users } from '../../db/schema.ts'

describe('FTS5 media index', () => {
  let client: Client
  let db: LibSQLDatabase
  let databaseDirectory: string

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-fts-test-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'search.db')).href,
    })
    db = drizzle(client)
    await migrateDatabase(db)

    await db.insert(users).values({
      id: 'user-1',
      name: 'Search User',
      email: 'search@example.com',
    })
    await db.insert(libraries).values({
      id: 'library-1',
      ownerId: 'user-1',
      name: 'Movies',
      type: 'video/movie',
      dataSources: [],
    })
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  async function insertMedia(
    overrides: Partial<typeof mediaItems.$inferInsert> = {},
  ) {
    await db.insert(mediaItems).values({
      id: 'media-1',
      libraryId: 'library-1',
      filePath: '/movies/arrival.mkv',
      fileSize: 1024,
      fileMetadata: {},
      mediaType: 'video/x-matroska',
      title: 'Arrival',
      description: 'A linguist encounters mysterious visitors',
      metadata: {
        genres: ['Science Fiction'],
        cast: [{ name: 'Amy Adams', character: 'Louise Banks' }],
        crew: [{ name: 'Denis Villeneuve', job: 'Director' }],
        tmdbId: 329865,
        images: {
          poster: [{ src: 'https://images.example/ArtworkOnlyToken.jpg' }],
        },
        website: 'https://RemoteOnlyToken.example/movie',
      },
      scannedAt: new Date(),
      tags: ['science-fiction', 'first-contact'],
      ...overrides,
    })
  }

  async function matchingIds(query: string): Promise<string[]> {
    const result = await client.execute({
      sql: 'SELECT id FROM media_fts WHERE media_fts MATCH ? ORDER BY rank',
      args: [query],
    })
    return result.rows.map((row) => String(row.id))
  }

  it('creates the FTS5 virtual table during migration', async () => {
    const result = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'media_fts'",
    )

    expect(result.rows[0]?.sql).toContain('fts5')
  })

  it('backfills media that exists before the FTS5 migration', async () => {
    const legacyClient = createClient({
      url: pathToFileURL(join(databaseDirectory, 'legacy.db')).href,
    })

    try {
      await legacyClient.executeMultiple(`
        CREATE TABLE media_items (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          file_path TEXT NOT NULL,
          tags TEXT NOT NULL,
          metadata TEXT NOT NULL
        );
        INSERT INTO media_items (id, title, description, file_path, tags, metadata)
        VALUES (
          'legacy-media',
          'Legacy Arrival',
          'Indexed during migration',
          '/legacy/arrival.mkv',
          '["archive"]',
          '{"genres":["Historical Drama"]}'
        );
      `)
      const migration = await readFile(
        new URL('../../../drizzle/0008_search_fts.sql', import.meta.url),
        'utf8',
      )
      await legacyClient.executeMultiple(migration)

      const result = await legacyClient.execute(
        "SELECT id FROM media_fts WHERE media_fts MATCH 'Legacy'",
      )
      expect(result.rows.map((row) => row.id)).toEqual(['legacy-media'])
      const metadataResult = await legacyClient.execute(
        "SELECT id FROM media_fts WHERE media_fts MATCH 'Historical'",
      )
      expect(metadataResult.rows.map((row) => row.id)).toEqual(['legacy-media'])
    } finally {
      legacyClient.close()
    }
  })

  it('indexes title, description, file path, tags, and metadata on insert', async () => {
    await insertMedia()

    await expect(matchingIds('Arrival')).resolves.toEqual(['media-1'])
    await expect(matchingIds('linguist')).resolves.toEqual(['media-1'])
    await expect(matchingIds('movies')).resolves.toEqual(['media-1'])
    await expect(matchingIds('fiction')).resolves.toEqual(['media-1'])
    await expect(matchingIds('Amy')).resolves.toEqual(['media-1'])
    await expect(matchingIds('Villeneuve')).resolves.toEqual(['media-1'])
    await expect(matchingIds('329865')).resolves.toEqual(['media-1'])
  })

  it('does not index metadata keys, artwork, or URL values', async () => {
    await insertMedia()

    await expect(matchingIds('genres')).resolves.toEqual([])
    await expect(matchingIds('ArtworkOnlyToken')).resolves.toEqual([])
    await expect(matchingIds('RemoteOnlyToken')).resolves.toEqual([])
  })

  it('replaces indexed values when searchable fields change', async () => {
    await insertMedia({ title: 'OldTitle' })
    await db
      .update(mediaItems)
      .set({
        title: 'Contact',
        tags: ['radio-astronomy'],
        metadata: { genres: ['Mystery'] },
      })
      .where(eq(mediaItems.id, 'media-1'))

    await expect(matchingIds('OldTitle')).resolves.toEqual([])
    await expect(matchingIds('Contact')).resolves.toEqual(['media-1'])
    await expect(matchingIds('astronomy')).resolves.toEqual(['media-1'])
    await expect(matchingIds('Amy')).resolves.toEqual([])
    await expect(matchingIds('Mystery')).resolves.toEqual(['media-1'])
  })

  it('removes indexed values when media is deleted', async () => {
    await insertMedia()
    await db.delete(mediaItems).where(eq(mediaItems.id, 'media-1'))

    await expect(matchingIds('Arrival')).resolves.toEqual([])
  })
})
