import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../db/migrate.ts'
import { libraries, mediaItems, users } from '../../db/schema.ts'
import { deleteLibraryById } from '../../services/libraryService.ts'

describe('libraryService.deleteLibraryById', () => {
  let client: Client
  let db: LibSQLDatabase
  let databaseDirectory: string

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-delete-library-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'library.db')).href,
    })
    db = drizzle(client)
    await migrateDatabase(db)

    await db.insert(users).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    })
    await db.insert(libraries).values({
      id: 'library-1',
      ownerId: 'user-1',
      name: 'Populated Library',
      type: 'video/movie',
      dataSources: [],
    })
    await db.insert(mediaItems).values({
      id: 'media-1',
      libraryId: 'library-1',
      filePath: '/movies/example.mkv',
      fileSize: 1024,
      fileMetadata: {},
      title: 'Example',
      scannedAt: new Date(),
    })
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  it('deletes a populated library and its indexed media', async () => {
    expect(
      (await client.execute('SELECT id FROM media_fts')).rows,
    ).toHaveLength(1)

    await deleteLibraryById(db, 'library-1')

    expect(await db.select().from(libraries)).toHaveLength(0)
    expect(await db.select().from(mediaItems)).toHaveLength(0)
    expect(
      (await client.execute('SELECT id FROM media_fts')).rows,
    ).toHaveLength(0)
  })
})
