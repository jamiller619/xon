import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaPlayStates } from '../../db/schema.ts'
import { saveMediaPlayState } from '../../services/mediaPlaybackService.ts'

describe('mediaPlaybackService', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await client.batch([
      `CREATE TABLE media_items (id text PRIMARY KEY NOT NULL)`,
      `CREATE TABLE media_play_states (
        user_id text NOT NULL,
        media_item_id text NOT NULL,
        position integer DEFAULT 0 NOT NULL,
        duration integer,
        status text DEFAULT 'playing' NOT NULL,
        started_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
        updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
        stopped_at integer,
        PRIMARY KEY (user_id, media_item_id)
      )`,
      `INSERT INTO media_items (id) VALUES ('media-1')`,
    ])
  })

  afterEach(() => client.close())

  it('preserves an existing duration when a later event omits it', async () => {
    await saveMediaPlayState(db, 'user-1', 'media-1', {
      position: 10,
      duration: 120,
      status: 'playing',
    })
    const stopped = await saveMediaPlayState(db, 'user-1', 'media-1', {
      position: 20,
      status: 'stopped',
    })

    expect(stopped).toMatchObject({
      position: 20,
      duration: 120,
      status: 'stopped',
    })
    expect(await db.select().from(mediaPlayStates)).toHaveLength(1)
  })

  it('returns undefined for an unknown media item', async () => {
    await expect(
      saveMediaPlayState(db, 'user-1', 'missing', {
        position: 0,
        status: 'playing',
      }),
    ).resolves.toBeUndefined()
  })
})
