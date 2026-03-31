import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';

describe('openDatabase', () => {
  const tempDir = join(tmpdir(), `xon-test-db-${Date.now()}`);

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates an in-memory database connection', async () => {
    const { client, db } = await openDatabase(':memory:');
    expect(db).toBeDefined();
    client.close();
  });

  it('db has expected drizzle query methods', async () => {
    const { client, db } = await openDatabase(':memory:');
    expect(typeof db.run).toBe('function');
    expect(typeof db.select).toBe('function');
    client.close();
  });

  it('enables WAL mode for file-based databases', async () => {
    await mkdir(tempDir, { recursive: true });
    const dbUrl = `file:${join(tempDir, 'test.db')}`;
    const { client } = await openDatabase(dbUrl);
    const result = await client.execute('PRAGMA journal_mode');
    expect(result.rows[0]?.[0]).toBe('wal');
    client.close();
  });

  it('uses DATA_DIR env variable for default URL', async () => {
    await mkdir(tempDir, { recursive: true });
    const original = process.env.DATA_DIR;
    process.env.DATA_DIR = tempDir;
    try {
      const { client, db } = await openDatabase();
      expect(db).toBeDefined();
      const result = await client.execute('PRAGMA journal_mode');
      expect(result.rows[0]?.[0]).toBe('wal');
      client.close();
    } finally {
      if (original === undefined) {
        process.env.DATA_DIR = undefined;
      } else {
        process.env.DATA_DIR = original;
      }
    }
  });
});
