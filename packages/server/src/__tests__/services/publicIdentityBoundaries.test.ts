import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collections,
  libraries,
  mediaItems,
  people,
  peopleMedia,
  sessions,
  users,
} from '../../db/schema.ts'
import { getLibraryById } from '../../services/libraryService.ts'
import { saveMediaPlayState } from '../../services/mediaPlaybackService.ts'
import { getMediaByIdWithLibrary } from '../../services/mediaService.ts'
import { searchMedia } from '../../services/searchService.ts'
import { listActiveSessions } from '../../services/sessionService.ts'
import { getUserCollections } from '../../services/userService.ts'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

describe('public identity boundaries', () => {
  const client = createClient({ url: ':memory:' })
  const db = drizzle(client)
  let userId: number
  let sessionId: number

  beforeEach(async () => {
    await migrate(db, { migrationsFolder })
    const [user] = await db
      .insert(users)
      .values({
        publicId: 'user-public',
        name: 'Public User',
        email: 'public@example.com',
      })
      .returning({ id: users.id })
    if (!user) throw new Error('User fixture was not created')
    userId = user.id

    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'library-public',
        ownerId: userId,
        name: 'Public Library',
        type: 'Movies',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Library fixture was not created')

    const [media] = await db
      .insert(mediaItems)
      .values({
        publicId: 'media-public',
        libraryId: library.id,
        filePath: 'public.mp4',
        fileSize: 1,
        fileMetadata: {},
        mediaType: 'video/mp4',
        title: 'Boundary Search Title',
        metadata: {},
        scannedAt: new Date(),
      })
      .returning({ id: mediaItems.id })
    if (!media) throw new Error('Media fixture was not created')

    const [person] = await db
      .insert(people)
      .values({ publicId: 'person-public', name: 'Public Person' })
      .returning({ id: people.id })
    if (!person) throw new Error('Person fixture was not created')

    await db.insert(peopleMedia).values({
      publicId: 'credit-public',
      personId: person.id,
      mediaId: media.id,
      role: 'Actor',
    })
    await db.insert(collections).values({
      publicId: 'collection-public',
      userId,
      type: 'collection',
      title: 'Public Collection',
    })

    const [session] = await db
      .insert(sessions)
      .values({
        publicId: 'session-public',
        userId,
        token: 'public-session-token',
        expiresAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      })
      .returning({ id: sessions.id })
    if (!session) throw new Error('Session fixture was not created')
    sessionId = session.id
  })

  afterEach(async () => {
    for (const table of [
      'media_play_states',
      'people_media',
      'people',
      'collections',
      'sessions',
      'media_items',
      'libraries',
      'users',
    ]) {
      await client.execute(`DELETE FROM ${table}`)
    }
  })

  afterAll(() => client.close())

  it('returns public strings for representative entity identifiers', async () => {
    const library = await getLibraryById(db, 'library-public')
    const media = await getMediaByIdWithLibrary(db, 'media-public')
    const collectionRows = await getUserCollections(db, userId)
    const sessionRows = await listActiveSessions(db, userId, sessionId)
    const playState = await saveMediaPlayState(db, userId, 'media-public', {
      position: 5,
      duration: 10,
      status: 'stopped',
    })
    const search = await searchMedia(db, {
      userId,
      query: 'Boundary',
      page: 1,
      limit: 10,
    })

    expect(library).toMatchObject({
      id: 'library-public',
      ownerId: 'user-public',
    })
    expect(media).toMatchObject({
      id: 'media-public',
      libraryId: 'library-public',
      library: { id: 'library-public', ownerId: 'user-public' },
      cast: [{ id: 'person-public' }],
    })
    expect(collectionRows[0]?.id).toBe('collection-public')
    expect(sessionRows[0]).toMatchObject({
      id: 'session-public',
      isCurrent: true,
    })
    expect(playState).toMatchObject({
      userId: 'user-public',
      mediaItemId: 'media-public',
    })
    expect(search.data[0]).toMatchObject({
      id: 'media-public',
      libraryId: 'library-public',
    })
  })
})
