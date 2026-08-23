import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, describe, expect, it } from 'vitest'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)
const journalPath = join(migrationsFolder, 'meta/_journal.json')

describe('integer primary-key migration', () => {
  let client: Client | undefined

  afterEach(() => client?.close())

  it('upgrades populated relationships through the real migration runner', async () => {
    client = createClient({ url: ':memory:' })
    const previousMigrationTime = await createPreMigrationDatabase(client)
    await seedLegacyGraph(client)
    await markMigrationsApplied(client, previousMigrationTime)

    await migrate(drizzle(client), { migrationsFolder })

    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([])
    expect((await client.execute('PRAGMA integrity_check')).rows[0]?.[0]).toBe(
      'ok',
    )

    const graph = await client.execute(`
      SELECT
        users.id AS user_id,
        users.public_id AS user_public_id,
        libraries.owner_id,
        media_items.library_id,
        collections.parent_collection_id,
        collection_items.collection_id,
        collection_items.media_item_id,
        media_play_states.user_id AS play_user_id,
        media_play_states.media_item_id AS play_media_id,
        people_media.person_id,
        people_media.media_id,
        sessions.user_id AS session_user_id,
        sessions.token
      FROM users
      JOIN libraries ON libraries.owner_id = users.id
      JOIN media_items ON media_items.library_id = libraries.id
      JOIN collection_items ON collection_items.media_item_id = media_items.id
      JOIN collections ON collections.id = collection_items.collection_id
      JOIN media_play_states ON media_play_states.media_item_id = media_items.id
      JOIN people_media ON people_media.media_id = media_items.id
      JOIN sessions ON sessions.user_id = users.id
      WHERE collections.public_id = 'season-old'
    `)

    expect(graph.rows[0]).toMatchObject({
      user_id: 1,
      user_public_id: 'user-old',
      owner_id: 1,
      library_id: 1,
      parent_collection_id: 1,
      collection_id: 2,
      media_item_id: 1,
      play_user_id: 1,
      play_media_id: 1,
      person_id: 1,
      media_id: 1,
      session_user_id: 1,
      token: 'active-token',
    })

    const fts = await client.execute(
      `SELECT id, title FROM media_fts WHERE media_fts MATCH 'Migration'`,
    )
    expect(fts.rows).toEqual([{ id: 1, title: 'Migration Movie' }])

    await client.execute({
      sql: `INSERT INTO users (public_id, name, email, email_verified, created_at, updated_at)
            VALUES (?, ?, ?, false, ?, ?)`,
      args: ['new-public-id', 'New User', 'new@example.com', 2, 2],
    })
    const newUser = await client.execute(
      `SELECT id, public_id FROM users WHERE public_id = 'new-public-id'`,
    )
    expect(newUser.rows[0]).toEqual({ id: 2, public_id: 'new-public-id' })
  })

  it('rolls the batch back when a legacy relationship cannot be mapped', async () => {
    client = createClient({ url: ':memory:' })
    const previousMigrationTime = await createPreMigrationDatabase(client)
    await client.execute('PRAGMA foreign_keys = OFF')
    await client.execute(`
      INSERT INTO libraries (
        id, created_at, owner_id, name, content_type, data_sources, images
      ) VALUES (
        'orphan-library', 1, 'missing-user', 'Orphan', 'Movies', '[]', '{"poster":[]}'
      )
    `)
    await client.execute('PRAGMA foreign_keys = ON')
    await markMigrationsApplied(client, previousMigrationTime)

    await expect(
      migrate(drizzle(client), { migrationsFolder }),
    ).rejects.toThrow()

    const columns = await client.execute('PRAGMA table_info(libraries)')
    expect(columns.rows.map((column) => column.name)).not.toContain('public_id')
    expect((await client.execute('SELECT id FROM libraries')).rows[0]?.id).toBe(
      'orphan-library',
    )
  })
})

async function createPreMigrationDatabase(client: Client): Promise<number> {
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>
  }
  const previous = journal.entries.at(-2)
  if (!previous) throw new Error('Previous migration is missing')

  for (const entry of journal.entries.slice(0, -1)) {
    const migrationSql = await readFile(
      join(migrationsFolder, `${entry.tag}.sql`),
      'utf8',
    )
    await client.executeMultiple(
      migrationSql.replaceAll('--> statement-breakpoint', ''),
    )
  }
  return previous.when
}

async function markMigrationsApplied(
  client: Client,
  previousMigrationTime: number,
): Promise<void> {
  await client.execute(`
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)
  await client.execute({
    sql: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
    args: ['pre-integer-keys', previousMigrationTime],
  })
}

async function seedLegacyGraph(client: Client): Promise<void> {
  await client.executeMultiple(`
    INSERT INTO users (
      id, name, email, email_verified, created_at, updated_at, is_anonymous
    ) VALUES ('user-old', 'Legacy User', 'legacy@example.com', false, 1, 1, false);

    INSERT INTO libraries (
      id, created_at, owner_id, name, content_type, data_sources, images
    ) VALUES (
      'library-old', 1, 'user-old', 'Legacy Library', 'Movies', '[]', '{"poster":[]}'
    );

    INSERT INTO collections (
      id, created_at, user_id, type, title, parent_collection_id, metadata
    ) VALUES
      ('series-old', 1, 'user-old', 'series', 'Series', NULL, '{}'),
      ('season-old', 2, 'user-old', 'season', 'Season 1', 'series-old', '{}');

    INSERT INTO media_items (
      id, created_at, library_id, file_path, file_size, file_metadata,
      media_type, title, metadata, drm_protected, scanned_at, tags
    ) VALUES (
      'media-old', 1, 'library-old', 'movie.mp4', 100, '{}',
      'video/mp4', 'Migration Movie', '{"genre":"Drama"}', false, 1, '[]'
    );

    INSERT INTO people (id, name, metadata)
    VALUES ('person-old', 'Legacy Person', '{}');

    INSERT INTO people_media (id, person_id, media_id, role, "order")
    VALUES ('credit-old', 'person-old', 'media-old', 'Actor', 1);

    INSERT INTO collection_items (collection_id, media_item_id, sort_order)
    VALUES ('season-old', 'media-old', 1);

    INSERT INTO media_play_states (
      user_id, media_item_id, position, duration, status, started_at, updated_at
    ) VALUES ('user-old', 'media-old', 30, 100, 'stopped', 1, 2);

    INSERT INTO sessions (
      id, expires_at, token, created_at, updated_at, last_seen_at, user_id
    ) VALUES ('session-old', 9999999999999, 'active-token', 1, 1, 1, 'user-old');
  `)
}
