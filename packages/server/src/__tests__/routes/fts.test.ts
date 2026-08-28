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
  let libraryId: number

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-fts-test-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'search.db')).href,
    })
    db = drizzle(client)
    await migrateDatabase(db)

    const [user] = await db
      .insert(users)
      .values({
        publicId: 'user-1',
        name: 'Search User',
        email: 'search@example.com',
      })
      .returning({ id: users.id })
    if (!user) throw new Error('Failed to seed user')
    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'library-1',
        ownerId: user.id,
        name: 'Movies',
        type: 'video/movie',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Failed to seed library')
    libraryId = library.id
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  async function insertMedia(
    overrides: Partial<typeof mediaItems.$inferInsert> = {},
  ) {
    await db.insert(mediaItems).values({
      publicId: 'media-1',
      libraryId,
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
      sql: `SELECT media.public_id
            FROM media_fts
            INNER JOIN media_items AS media ON media.id = media_fts.id
            WHERE media_fts MATCH ?
            ORDER BY rank`,
      args: [query],
    })
    return result.rows.map((row) => String(row.public_id))
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

  it('upgrades and backfills an existing five-column FTS index', async () => {
    const legacyClient = createClient({
      url: pathToFileURL(join(databaseDirectory, 'legacy-fts.db')).href,
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
        CREATE VIRTUAL TABLE media_fts USING fts5(
          id UNINDEXED,
          title,
          description,
          file_path,
          tags,
          tokenize = 'unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER media_items_fts_insert
        AFTER INSERT ON media_items
        BEGIN
          INSERT INTO media_fts (id, title, description, file_path, tags)
          VALUES (
            new.id,
            new.title,
            coalesce(new.description, ''),
            new.file_path,
            coalesce(new.tags, '[]')
          );
        END;
        CREATE TRIGGER media_items_fts_update
        AFTER UPDATE OF id, title, description, file_path, tags ON media_items
        BEGIN
          DELETE FROM media_fts WHERE id = old.id;
          INSERT INTO media_fts (id, title, description, file_path, tags)
          VALUES (
            new.id,
            new.title,
            coalesce(new.description, ''),
            new.file_path,
            coalesce(new.tags, '[]')
          );
        END;
        CREATE TRIGGER media_items_fts_delete
        AFTER DELETE ON media_items
        BEGIN
          DELETE FROM media_fts WHERE id = old.id;
        END;
        INSERT INTO media_items (id, title, description, file_path, tags, metadata)
        VALUES (
          'legacy-media',
          'Legacy Arrival',
          'Indexed before migration',
          '/legacy/arrival.mkv',
          '["archive"]',
          '{"genres":["Historical Drama"]}'
        );
      `)

      const migration = await readFile(
        new URL(
          '../../../drizzle/0009_rebuild_search_fts_metadata.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await legacyClient.executeMultiple(migration)

      const columns = await legacyClient.execute('PRAGMA table_info(media_fts)')
      expect(columns.rows.map((row) => row.name)).toContain('metadata_text')

      const backfilled = await legacyClient.execute(
        "SELECT id FROM media_fts WHERE media_fts MATCH 'Historical'",
      )
      expect(backfilled.rows.map((row) => row.id)).toEqual(['legacy-media'])

      await legacyClient.execute({
        sql: 'UPDATE media_items SET metadata = ? WHERE id = ?',
        args: ['{"genres":["Mystery"]}', 'legacy-media'],
      })

      const replaced = await legacyClient.execute(
        "SELECT id FROM media_fts WHERE media_fts MATCH 'Mystery'",
      )
      expect(replaced.rows.map((row) => row.id)).toEqual(['legacy-media'])
      const removed = await legacyClient.execute(
        "SELECT id FROM media_fts WHERE media_fts MATCH 'Historical'",
      )
      expect(removed.rows).toHaveLength(0)
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
      .where(eq(mediaItems.publicId, 'media-1'))

    await expect(matchingIds('OldTitle')).resolves.toEqual([])
    await expect(matchingIds('Contact')).resolves.toEqual(['media-1'])
    await expect(matchingIds('astronomy')).resolves.toEqual(['media-1'])
    await expect(matchingIds('Amy')).resolves.toEqual([])
    await expect(matchingIds('Mystery')).resolves.toEqual(['media-1'])
  })

  it('removes indexed values when media is deleted', async () => {
    await insertMedia()
    await db.delete(mediaItems).where(eq(mediaItems.publicId, 'media-1'))

    await expect(matchingIds('Arrival')).resolves.toEqual([])
  })
})
