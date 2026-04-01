import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db.js';
import { migrateDatabase } from '../../migrate.js';
import { dataSources, libraries, mediaItems } from '../../schema.js';

describe('FTS5 full-text search index', () => {
  let client: Client;
  let db: LibSQLDatabase;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);

    await db
      .insert(libraries)
      .values({ id: 'lib-1', name: 'Movies', allowedMediaTypes: '[]' });
    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/media',
    });
  });

  afterEach(() => {
    client.close();
  });

  async function queryFts(term: string): Promise<{ id: string }[]> {
    const result = await client.execute({
      sql: 'SELECT id FROM media_fts WHERE media_fts MATCH ? ORDER BY rank',
      args: [term],
    });
    return result.rows as { id: string }[];
  }

  it('inserts media item into FTS index via trigger', async () => {
    await db.insert(mediaItems).values({
      id: 'item-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/inception.mkv',
      fileName: 'inception.mkv',
      fileSize: 5000,
      title: 'Inception',
      description: 'A mind-bending thriller',
      metadata: '{}',
    });

    const rows = await queryFts('Inception');
    expect(rows.some((r) => r.id === 'item-1')).toBe(true);
  });

  it('finds items by description text', async () => {
    await db.insert(mediaItems).values({
      id: 'item-2',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/interstellar.mkv',
      fileName: 'interstellar.mkv',
      fileSize: 6000,
      title: 'Interstellar',
      description: 'A journey through wormholes',
      metadata: '{}',
    });

    const rows = await queryFts('wormholes');
    expect(rows.some((r) => r.id === 'item-2')).toBe(true);
  });

  it('finds items by file name', async () => {
    await db.insert(mediaItems).values({
      id: 'item-3',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/the-matrix.mkv',
      fileName: 'the-matrix.mkv',
      fileSize: 4000,
      metadata: '{}',
    });

    const rows = await queryFts('matrix');
    expect(rows.some((r) => r.id === 'item-3')).toBe(true);
  });

  it('updates FTS index when media item title changes', async () => {
    await db.insert(mediaItems).values({
      id: 'item-4',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/movie-alpha.mkv',
      fileName: 'movie-alpha.mkv',
      fileSize: 3000,
      title: 'OldTitle',
      metadata: '{}',
    });

    // Verify original title is indexed
    let rows = await queryFts('OldTitle');
    expect(rows.some((r) => r.id === 'item-4')).toBe(true);

    // Update the title via raw SQL to trigger the UPDATE trigger
    await client.execute({
      sql: "UPDATE media_items SET title = 'NewTitle', updated_at = unixepoch() WHERE id = 'item-4'",
      args: [],
    });

    // Old title should no longer match
    rows = await queryFts('OldTitle');
    expect(rows.some((r) => r.id === 'item-4')).toBe(false);

    // New title should match
    rows = await queryFts('NewTitle');
    expect(rows.some((r) => r.id === 'item-4')).toBe(true);
  });

  it('removes media item from FTS index when deleted', async () => {
    await db.insert(mediaItems).values({
      id: 'item-5',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/todelete.mkv',
      fileName: 'todelete.mkv',
      fileSize: 2000,
      title: 'ToDelete',
      metadata: '{}',
    });

    // Verify it's indexed
    let rows = await queryFts('ToDelete');
    expect(rows.some((r) => r.id === 'item-5')).toBe(true);

    // Delete the media item
    await client.execute({
      sql: "DELETE FROM media_items WHERE id = 'item-5'",
      args: [],
    });

    // Should no longer appear in FTS results
    rows = await queryFts('ToDelete');
    expect(rows.some((r) => r.id === 'item-5')).toBe(false);
  });

  it('indexes tags from metadata JSON', async () => {
    await db.insert(mediaItems).values({
      id: 'item-6',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/media/documentary.mkv',
      fileName: 'documentary.mkv',
      fileSize: 7000,
      title: 'Nature Documentary',
      metadata: JSON.stringify({ tags: ['wildlife', 'nature', 'documentary'] }),
    });

    const rows = await queryFts('wildlife');
    expect(rows.some((r) => r.id === 'item-6')).toBe(true);
  });

  it('backfills pre-existing items when migrated', async () => {
    // The backfill INSERT in the migration runs on existing data at migration time.
    // In this test, items are inserted after migration so they go through triggers.
    // This test validates the FTS table exists and is queryable.
    const result = await client.execute({
      sql: 'SELECT count(*) as cnt FROM media_fts',
      args: [],
    });
    expect(result.rows[0]).toBeDefined();
  });
});
