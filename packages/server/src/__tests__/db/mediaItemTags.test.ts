import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import {
  migrateMediaItemTags,
  migrateMediaItemTagValue,
} from '../../db/dataMigrations/mediaItemTags.ts'

describe('media item tag data migration', () => {
  it('derives genres, preserves manual tags, and recovers legacy metadata tags', () => {
    expect(
      migrateMediaItemTagValue(
        ['favorite', 'genre:stale'],
        {
          genres: ['Science Fiction', 'Drama'],
          tags: [' Legacy ', 'favorite'],
          nested: { retained: true },
        },
        { genre: 'Ambient' },
      ),
    ).toEqual({
      tags: [
        'favorite',
        'Legacy',
        'genre:science-fiction',
        'genre:drama',
        'genre:ambient',
      ],
      metadata: {
        genres: ['Science Fiction', 'Drama'],
        nested: { retained: true },
      },
      changed: true,
    })
  })

  it('skips malformed persisted JSON values', () => {
    expect(migrateMediaItemTagValue('not-json', '{}', '{}')).toBeNull()
    expect(migrateMediaItemTagValue('[]', '[]', '{}')).toBeNull()
  })

  it('updates rows exactly once', async () => {
    const fixture = await databaseFixture()
    try {
      await fixture.db.run(sql`
        INSERT INTO media_items (tags, metadata, file_metadata)
        VALUES (
          '["favorite","genre:stale"]',
          '{"genres":["Science Fiction"],"tags":["Legacy"]}',
          '{"genre":"Ambient"}'
        )
      `)

      await migrateMediaItemTags(fixture.db)
      await migrateMediaItemTags(fixture.db)

      const rows = await fixture.client.execute(
        'SELECT tags, metadata FROM media_items',
      )
      expect(JSON.parse(String(rows.rows[0]?.tags))).toEqual([
        'favorite',
        'Legacy',
        'genre:science-fiction',
        'genre:ambient',
      ])
      expect(JSON.parse(String(rows.rows[0]?.metadata))).toEqual({
        genres: ['Science Fiction'],
      })
      const markers = await fixture.client.execute(
        "SELECT id FROM xon_data_migrations WHERE id = '0006_media_item_genre_tags'",
      )
      expect(markers.rows).toHaveLength(1)
    } finally {
      await fixture.close()
    }
  })

  it('rolls back row updates and the marker when a row fails', async () => {
    const fixture = await databaseFixture()
    try {
      await fixture.db.run(sql`
        INSERT INTO media_items (tags, metadata, file_metadata) VALUES
          ('[]', '{"genre":"Drama"}', '{}'),
          ('[]', '{"genre":"Comedy"}', '{}')
      `)
      await fixture.client.executeMultiple(`
        CREATE TRIGGER reject_second_tag_update
        BEFORE UPDATE OF tags ON media_items
        WHEN new.id = 2
        BEGIN
          SELECT RAISE(ABORT, 'reject second row');
        END;
      `)

      await expect(migrateMediaItemTags(fixture.db)).rejects.toThrow(
        'reject second row',
      )

      const rows = await fixture.client.execute(
        'SELECT tags FROM media_items ORDER BY id',
      )
      expect(rows.rows.map((row) => row.tags)).toEqual(['[]', '[]'])
      const markers = await fixture.client.execute(
        "SELECT id FROM xon_data_migrations WHERE id = '0006_media_item_genre_tags'",
      )
      expect(markers.rows).toEqual([])
    } finally {
      await fixture.close()
    }
  })
})

async function databaseFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'xon-media-tags-'))
  const client = createClient({
    url: pathToFileURL(join(directory, 'xon.db')).href,
  })
  const db = drizzle(client)
  await db.run(sql`
    CREATE TABLE media_items (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      tags text DEFAULT '[]' NOT NULL,
      metadata text DEFAULT '{}' NOT NULL,
      file_metadata text DEFAULT '{}' NOT NULL
    )
  `)

  return {
    client,
    db,
    async close() {
      client.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
