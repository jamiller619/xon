import { unlink } from 'node:fs/promises'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../db/migrate.ts'
import { libraries, mediaItems, users } from '../../db/schema.ts'
import type { MediaJob, PipelineContext } from '../../scanner/pipeline.ts'
import persist from '../../scanner/stages/persist.ts'

describe('persist stage tags', () => {
  let client: Client
  let db: LibSQLDatabase
  let databasePath: string
  let libraryId: number

  beforeEach(async () => {
    databasePath = `/tmp/xon-persist-tags-${crypto.randomUUID()}.db`
    client = createClient({ url: `file:${databasePath}` })
    db = drizzle(client)
    await migrateDatabase(db)

    const [user] = await db
      .insert(users)
      .values({
        publicId: 'user-1',
        name: 'Test User',
        email: 'persist-tags@example.com',
      })
      .returning({ id: users.id })
    if (!user) throw new Error('Failed to seed user')
    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'library-1',
        ownerId: user.id,
        name: 'Music',
        type: 'audio',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Failed to seed library')
    libraryId = library.id
  })

  afterEach(async () => {
    client.close()
    await unlink(databasePath).catch(() => undefined)
  })

  it('writes tags for new, changed, and refreshed jobs', async () => {
    const newJob = job('new', {
      publicId: 'media-1',
      title: 'Track',
      drmProtected: false,
      metadata: { genres: ['Rock'] },
      tags: ['favorite', 'genre:rock'],
    })

    await persist.run(context(), newJob)
    let [item] = await db.select().from(mediaItems)
    expect(item?.tags).toEqual(['favorite', 'genre:rock'])
    if (!item) throw new Error('Failed to persist media')

    await persist.run(
      context(),
      job('changed', {
        publicId: item.publicId,
        metadata: { genres: ['Ambient'] },
        tags: ['favorite', 'genre:ambient'],
      }),
    )
    ;[item] = await db.select().from(mediaItems)
    expect(item?.tags).toEqual(['favorite', 'genre:ambient'])
    if (!item) throw new Error('Changed media disappeared')

    await persist.run(
      context(),
      job('refresh', {
        id: item.id,
        publicId: item.publicId,
        metadata: { genres: ['Jazz'] },
        tags: ['favorite', 'genre:jazz'],
      }),
    )
    ;[item] = await db.select().from(mediaItems)
    expect(item?.tags).toEqual(['favorite', 'genre:jazz'])
  })

  function context(): PipelineContext {
    return {
      db,
      libraryId,
      libraryPublicId: 'library-1',
      contentType: 'audio',
      logger: {
        log: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }
  }

  function job(type: MediaJob['type'], data: MediaJob['data']): MediaJob {
    const now = new Date()
    return {
      id: crypto.randomUUID(),
      type,
      file: {
        id: '/music/track.mp3',
        path: '/music/track.mp3',
        name: 'track.mp3',
        size: 100,
        createdAt: now,
        modifiedAt: now,
        ext: '.mp3',
        mediaType: 'audio/mpeg',
      },
      libraryId,
      libraryPublicId: 'library-1',
      contentType: 'audio',
      mediaTypes: [],
      dataSourcePath: '/music',
      dataSourceId: 'source-1',
      data,
      errors: [],
    }
  }
})
