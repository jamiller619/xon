import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../db/migrate.ts'

describe('session metadata migrations', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('backfills existing sessions and preserves constraints and indexes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'xon-session-migration-'))
    const client = createClient({ url: `file:${join(directory, 'xon.db')}` })

    try {
      await client.executeMultiple(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (id text PRIMARY KEY NOT NULL);
        CREATE TABLE sessions (
          id text PRIMARY KEY NOT NULL,
          expires_at integer NOT NULL,
          token text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          ip_address text,
          user_agent text,
          user_id text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
        );
        CREATE UNIQUE INDEX sessions_token_unique ON sessions (token);
        CREATE INDEX sessions_userId_idx ON sessions (user_id);
        INSERT INTO users (id) VALUES ('user-1');
        INSERT INTO sessions (
          id, expires_at, token, created_at, updated_at,
          ip_address, user_agent, user_id
        ) VALUES (
          'session-1', 2000, 'secret-token', 1000, 1500,
          '192.0.2.10', 'Example Browser', 'user-1'
        );
      `)

      const migration = await readFile(
        new URL(
          '../../../drizzle/0010_chubby_the_phantom.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await client.executeMultiple(migration)

      const clientNameMigration = await readFile(
        new URL(
          '../../../drizzle/0011_romantic_celestials.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await client.executeMultiple(clientNameMigration)

      const row = await client.execute('SELECT * FROM sessions')
      expect(row.rows).toEqual([
        expect.objectContaining({
          id: 'session-1',
          token: 'secret-token',
          user_id: 'user-1',
          ip_address: '192.0.2.10',
          user_agent: 'Example Browser',
          created_at: 1000,
          updated_at: 1500,
          last_seen_at: 1500,
          client_name: null,
        }),
      ])

      const columns = await client.execute('PRAGMA table_info(sessions)')
      const lastSeen = columns.rows.find(
        (column) => column.name === 'last_seen_at',
      )
      expect(lastSeen).toMatchObject({ notnull: 1 })

      const indexes = await client.execute('PRAGMA index_list(sessions)')
      expect(indexes.rows.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          'sessions_token_unique',
          'sessions_userId_idx',
        ]),
      )

      await expect(
        client.execute({
          sql: `INSERT INTO sessions (
            id, expires_at, token, created_at, updated_at,
            last_seen_at, user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: ['session-2', 2000, 'secret-token', 1000, 1500, 1500, 'user-1'],
        }),
      ).rejects.toThrow()
    } finally {
      client.close()
    }
  })

  it('creates last_seen_at with a default in a fresh database', async () => {
    directory = await mkdtemp(join(tmpdir(), 'xon-session-fresh-'))
    const client = createClient({ url: `file:${join(directory, 'xon.db')}` })

    try {
      await migrateDatabase(drizzle(client))
      await client.execute(`
        INSERT INTO users (
          id, name, email, email_verified, created_at, updated_at
        ) VALUES (
          'user-1', 'User', 'user@example.com', 1, 1000, 1000
        )
      `)
      await client.execute(`
        INSERT INTO sessions (
          id, expires_at, token, created_at, updated_at, user_id
        ) VALUES (
          'session-1', 2000, 'token-1', 1000, 1000, 'user-1'
        )
      `)

      const row = await client.execute({
        sql: 'SELECT last_seen_at, client_name FROM sessions WHERE id = ?',
        args: ['session-1'],
      })
      expect(row.rows[0]?.last_seen_at).toEqual(expect.any(Number))
      expect(row.rows[0]?.client_name).toBeNull()
    } finally {
      client.close()
    }
  })
})
