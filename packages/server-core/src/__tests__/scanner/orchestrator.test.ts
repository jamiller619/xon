import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { dataSources, libraries, mediaItems } from '../../db/schema.js';
import {
  type ScanProgress,
  type ScanSummary,
  scanLibrary,
} from '../../scanner/orchestrator.js';

describe('scanLibrary', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    tmpDir = await mkdtemp(join(tmpdir(), 'xon-orchestrator-test-'));
  });

  afterEach(async () => {
    client.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function createLibraryRecord(name = 'Test Library') {
    const id = crypto.randomUUID();
    const now = new Date();
    await db
      .insert(libraries)
      .values({ id, name, createdAt: now, updatedAt: now });
    return id;
  }

  async function createDataSource(
    libraryId: string,
    path: string,
    recursive = false,
  ) {
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(dataSources).values({
      id,
      libraryId,
      type: 'local',
      path,
      recursive,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  it('throws if library does not exist', async () => {
    await expect(scanLibrary(db, 'nonexistent-id')).rejects.toThrow(
      'Library not found',
    );
  });

  it('returns zero summary for library with no data sources', async () => {
    const libraryId = await createLibraryRecord();
    const summary = await scanLibrary(db, libraryId);
    expect(summary).toEqual<ScanSummary>({
      libraryId,
      newItems: 0,
      updatedItems: 0,
      removedItems: 0,
      totalDiscovered: 0,
    });
  });

  it('creates media items for new files', async () => {
    const libraryId = await createLibraryRecord();
    await writeFile(join(tmpDir, 'movie.mp4'), Buffer.alloc(1024));
    await writeFile(join(tmpDir, 'song.mp3'), Buffer.alloc(512));
    await createDataSource(libraryId, tmpDir);

    const summary = await scanLibrary(db, libraryId);

    expect(summary.newItems).toBe(2);
    expect(summary.updatedItems).toBe(0);
    expect(summary.removedItems).toBe(0);
    expect(summary.totalDiscovered).toBe(2);

    const items = await db.select().from(mediaItems).where();
    expect(items).toHaveLength(2);
    const fileNames = items.map((i) => i.fileName);
    expect(fileNames).toContain('movie.mp4');
    expect(fileNames).toContain('song.mp3');
  });

  it('media items have correct fields populated', async () => {
    const libraryId = await createLibraryRecord();
    const sourceId = await createDataSource(libraryId, tmpDir);
    await writeFile(join(tmpDir, 'video.mp4'), Buffer.alloc(2048));

    await scanLibrary(db, libraryId);

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toBeDefined();
    if (!item) return;

    expect(item.libraryId).toBe(libraryId);
    expect(item.dataSourceId).toBe(sourceId);
    expect(item.fileName).toBe('video.mp4');
    expect(item.fileSize).toBe(2048);
    expect(item.mimeType).toBe('video/mp4');
    expect(item.mediaCategory).toBe('Movies');
    expect(item.scannedAt).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it('updates changed files (size differs)', async () => {
    const libraryId = await createLibraryRecord();
    const sourceId = await createDataSource(libraryId, tmpDir);
    const filePath = join(tmpDir, 'track.mp3');
    await writeFile(filePath, Buffer.alloc(512));

    // First scan — creates item
    await scanLibrary(db, libraryId);

    // Overwrite with different size
    await writeFile(filePath, Buffer.alloc(999));

    // Second scan — should detect change
    const summary = await scanLibrary(db, libraryId);

    expect(summary.newItems).toBe(0);
    expect(summary.updatedItems).toBe(1);
    expect(summary.removedItems).toBe(0);

    const items = await db.select().from(mediaItems).where();
    expect(items).toHaveLength(1);
    expect(items[0]?.fileSize).toBe(999);
  });

  it('removes deleted files from the database', async () => {
    const libraryId = await createLibraryRecord();
    const sourceId = await createDataSource(libraryId, tmpDir);
    const filePath = join(tmpDir, 'deleteme.mp4');
    await writeFile(filePath, Buffer.alloc(100));

    // First scan — creates item
    await scanLibrary(db, libraryId);
    const afterFirst = await db.select().from(mediaItems);
    expect(afterFirst).toHaveLength(1);

    // Remove file from disk
    await rm(filePath);

    // Second scan — should remove item
    const summary = await scanLibrary(db, libraryId);

    expect(summary.removedItems).toBe(1);
    const afterSecond = await db.select().from(mediaItems);
    expect(afterSecond).toHaveLength(0);
  });

  it('skips disabled data sources', async () => {
    const libraryId = await createLibraryRecord();
    const now = new Date();
    await db.insert(dataSources).values({
      id: crypto.randomUUID(),
      libraryId,
      type: 'local',
      path: tmpDir,
      recursive: false,
      enabled: false,
      createdAt: now,
      updatedAt: now,
    });
    await writeFile(join(tmpDir, 'video.mkv'), Buffer.alloc(500));

    const summary = await scanLibrary(db, libraryId);

    expect(summary.newItems).toBe(0);
    expect(summary.totalDiscovered).toBe(0);
  });

  it('calls onProgress callback with progress updates', async () => {
    const libraryId = await createLibraryRecord();
    await writeFile(join(tmpDir, 'clip.mp4'), Buffer.alloc(256));
    await createDataSource(libraryId, tmpDir);

    const progressUpdates: ScanProgress[] = [];
    await scanLibrary(db, libraryId, (p) => progressUpdates.push({ ...p }));

    expect(progressUpdates.length).toBeGreaterThan(0);
    const last = progressUpdates[progressUpdates.length - 1];
    expect(last?.currentFile).toContain('clip.mp4');
  });

  it('processes multiple data sources', async () => {
    const libraryId = await createLibraryRecord();
    const { mkdtemp: mk2 } = await import('node:fs/promises');
    const tmpDir2 = await mkdtemp(join(tmpdir(), 'xon-orch-test2-'));

    try {
      await writeFile(join(tmpDir, 'movie.mp4'), Buffer.alloc(100));
      await writeFile(join(tmpDir2, 'song.mp3'), Buffer.alloc(200));
      await createDataSource(libraryId, tmpDir);
      await createDataSource(libraryId, tmpDir2);

      const summary = await scanLibrary(db, libraryId);

      expect(summary.newItems).toBe(2);
      expect(summary.totalDiscovered).toBe(2);
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });
});
