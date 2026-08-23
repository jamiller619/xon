import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  libraries,
  mediaItems,
  mediaPlayStates,
  users,
} from '../../db/schema.ts'
import {
  getPlayStateProgress,
  getResumablePlayStates,
} from '../../services/userService.ts'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

describe('userService play-state reads', () => {
  let client: Client
  let db: LibSQLDatabase
  let userId: number
  let otherUserId: number
  let libraryId: number

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })

    ;[userId, otherUserId] = await Promise.all([
      insertUser('play-user', 'play@example.com'),
      insertUser('other-user', 'other-play@example.com'),
    ])
    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'play-library',
        ownerId: userId,
        name: 'Play library',
        type: 'Movies',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Library fixture was not created')
    libraryId = library.id
  })

  afterEach(() => client.close())

  it('returns only the latest 50 resumable states with public media data', async () => {
    const now = Date.now()
    for (let index = 0; index < 51; index++) {
      const mediaId = await insertMedia(`media-${index}`, `Media ${index}`)
      await db.insert(mediaPlayStates).values({
        userId,
        mediaItemId: mediaId,
        position: index,
        duration: 100,
        status: index === 0 ? 'completed' : 'stopped',
        updatedAt: new Date(now + index),
      })
    }
    const otherMediaId = await insertMedia('other-media', 'Other media')
    await db.insert(mediaPlayStates).values({
      userId: otherUserId,
      mediaItemId: otherMediaId,
      position: 99,
      status: 'playing',
      updatedAt: new Date(now + 100),
    })

    const rows = await getResumablePlayStates(db, userId)

    expect(rows).toHaveLength(50)
    expect(rows[0]).toMatchObject({
      mediaItemId: 'media-50',
      position: 50,
      mediaItem: {
        id: 'media-50',
        libraryId: 'play-library',
        title: 'Media 50',
      },
    })
    expect(rows.at(-1)?.mediaItemId).toBe('media-1')
    expect(rows.some(({ mediaItemId }) => mediaItemId === 'media-0')).toBe(
      false,
    )
    expect(rows.some(({ mediaItemId }) => mediaItemId === 'other-media')).toBe(
      false,
    )
  })

  it('returns compact progress for every current-user status', async () => {
    const completedMediaId = await insertMedia('completed-media', 'Completed')
    const playingMediaId = await insertMedia('playing-media', 'Playing')
    await db.insert(mediaPlayStates).values([
      {
        userId,
        mediaItemId: completedMediaId,
        position: 100,
        duration: 100,
        status: 'completed',
      },
      {
        userId,
        mediaItemId: playingMediaId,
        position: 5,
        duration: 100,
        status: 'playing',
      },
    ])

    expect(await getPlayStateProgress(db, userId)).toEqual(
      expect.arrayContaining([
        {
          mediaItemId: 'completed-media',
          position: 100,
          duration: 100,
          status: 'completed',
        },
        {
          mediaItemId: 'playing-media',
          position: 5,
          duration: 100,
          status: 'playing',
        },
      ]),
    )
  })

  async function insertUser(publicId: string, email: string) {
    const [row] = await db
      .insert(users)
      .values({ publicId, name: publicId, email })
      .returning({ id: users.id })
    if (!row) throw new Error('User fixture was not created')
    return row.id
  }

  async function insertMedia(publicId: string, title: string) {
    const [row] = await db
      .insert(mediaItems)
      .values({
        publicId,
        libraryId,
        filePath: `/${publicId}.mp4`,
        fileSize: 1,
        fileMetadata: {},
        mediaType: 'video/mp4',
        title,
        metadata: {},
        scannedAt: new Date(),
      })
      .returning({ id: mediaItems.id })
    if (!row) throw new Error('Media fixture was not created')
    return row.id
  }
})
