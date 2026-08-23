import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { CollectionType, MediaType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
  users,
} from '../../db/schema.ts'
import {
  addCollectionItem,
  createCollection,
  deleteCollection,
  getCollectionMedia,
  getPublicCollection,
  getPublicCollections,
  removeCollectionItem,
  reorderCollectionItems,
  updateCollection,
} from '../../services/collectionService.ts'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

describe('collectionService', () => {
  let client: Client
  let db: LibSQLDatabase
  let databaseDirectory: string
  let userId: number
  let otherUserId: number
  let collectionId: number
  let firstMediaId: number
  let secondMediaId: number

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-collections-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'collections.db')).href,
    })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })

    ;[userId, otherUserId] = await Promise.all([
      insertUser('owner-public', 'owner@example.com'),
      insertUser('other-public', 'other@example.com'),
    ])
    const firstLibraryId = await insertLibrary(
      'library-first',
      userId,
      'First library',
    )
    const secondLibraryId = await insertLibrary(
      'library-second',
      userId,
      'Second library',
    )
    firstMediaId = await insertMedia(
      'media-first',
      firstLibraryId,
      'First',
      100,
      null,
    )
    secondMediaId = await insertMedia(
      'media-second',
      secondLibraryId,
      'Second',
      200,
      'matched',
    )
    collectionId = await insertCollection(
      'collection-mine',
      userId,
      CollectionType.Collection,
      'Mine',
    )
    await insertCollection(
      'collection-auto',
      userId,
      CollectionType.Favorites,
      'Favorites',
    )
    await insertCollection(
      'collection-theirs',
      otherUserId,
      CollectionType.Collection,
      'Theirs',
    )
    await db.insert(collectionItems).values([
      { collectionId, mediaItemId: secondMediaId, sortOrder: 0 },
      { collectionId, mediaItemId: firstMediaId, sortOrder: 1 },
    ])
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  it('creates and reads public user-scoped collections', async () => {
    const created = await createCollection(db, userId, {
      type: CollectionType.Playlist,
      title: 'New playlist',
    })

    expect(created).toMatchObject({
      title: 'New playlist',
      type: CollectionType.Playlist,
    })
    expect(created.id).toEqual(expect.any(String))
    expect(created).not.toHaveProperty('userId')

    const mine = await getPublicCollections(db, userId)
    expect(mine.map(({ id }) => id)).toEqual([
      'collection-mine',
      'collection-auto',
      created.id,
    ])
    expect(
      await getPublicCollection(db, 'collection-theirs', userId),
    ).toBeUndefined()
  })

  it('returns paginated public media across libraries with filters and totals', async () => {
    const page = await getCollectionMedia(db, 'collection-mine', userId, {
      page: 1,
      limit: 1,
      sortBy: 'sortOrder',
      order: 'asc',
      unmatched: false,
    })

    expect(page).toMatchObject({
      status: 'ok',
      total: 2,
      items: [
        {
          id: 'media-second',
          libraryId: 'library-second',
          title: 'Second',
        },
      ],
    })

    const unmatched = await getCollectionMedia(db, 'collection-mine', userId, {
      page: 1,
      limit: 10,
      sortBy: 'title',
      order: 'asc',
      mediaType: MediaType.MainType.Video,
      unmatched: true,
    })
    expect(unmatched).toMatchObject({
      status: 'ok',
      total: 1,
      items: [{ id: 'media-first' }],
    })
    expect(
      await getCollectionMedia(db, 'collection-theirs', userId, {
        page: 1,
        limit: 10,
        sortBy: 'sortOrder',
        order: 'asc',
        unmatched: false,
      }),
    ).toEqual({ status: 'not_found' })
  })

  it('updates and deletes only manual owned collections', async () => {
    const updated = await updateCollection(db, 'collection-mine', userId, {
      title: 'Renamed',
    })
    expect(updated).toMatchObject({
      status: 'ok',
      collection: { title: 'Renamed' },
    })
    expect(
      await updateCollection(db, 'collection-auto', userId, {
        title: 'Nope',
      }),
    ).toEqual({ status: 'immutable' })
    expect(await deleteCollection(db, 'collection-theirs', userId)).toEqual({
      status: 'not_found',
    })
    expect(await deleteCollection(db, 'collection-auto', userId)).toEqual({
      status: 'immutable',
    })
    expect(await deleteCollection(db, 'collection-mine', userId)).toEqual({
      status: 'ok',
    })
    expect(
      await getPublicCollection(db, 'collection-mine', userId),
    ).toBeUndefined()
  })

  it('appends, upserts, and removes collection items', async () => {
    const thirdLibraryId = await insertLibrary(
      'library-third',
      userId,
      'Third library',
    )
    const thirdMediaId = await insertMedia(
      'media-third',
      thirdLibraryId,
      'Third',
      300,
      null,
    )

    expect(
      await addCollectionItem(db, 'collection-mine', userId, {
        mediaItemId: 'media-third',
      }),
    ).toEqual({
      status: 'created',
      item: {
        collectionId: 'collection-mine',
        mediaItemId: 'media-third',
        sortOrder: 2,
      },
    })
    expect(
      await addCollectionItem(db, 'collection-mine', userId, {
        mediaItemId: 'media-third',
        sortOrder: 9,
      }),
    ).toMatchObject({ status: 'updated', item: { sortOrder: 9 } })

    expect(
      await removeCollectionItem(db, 'collection-mine', userId, 'media-third'),
    ).toEqual({ status: 'ok' })
    expect(
      await db
        .select()
        .from(collectionItems)
        .where(
          and(
            eq(collectionItems.collectionId, collectionId),
            eq(collectionItems.mediaItemId, thirdMediaId),
          ),
        ),
    ).toEqual([])
  })

  it('validates every reorder item before transactionally updating', async () => {
    expect(
      await reorderCollectionItems(db, 'collection-mine', userId, [
        { mediaItemId: 'media-first', sortOrder: 99 },
        { mediaItemId: 'missing', sortOrder: 100 },
      ]),
    ).toEqual({ status: 'items_not_found' })

    const unchanged = await db
      .select({ sortOrder: collectionItems.sortOrder })
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.mediaItemId, firstMediaId),
        ),
      )
      .get()
    expect(unchanged?.sortOrder).toBe(1)

    expect(
      await reorderCollectionItems(db, 'collection-mine', userId, [
        { mediaItemId: 'media-first', sortOrder: 0 },
        { mediaItemId: 'media-second', sortOrder: 1 },
      ]),
    ).toEqual({ status: 'ok' })
    expect(
      await reorderCollectionItems(db, 'collection-mine', userId, []),
    ).toEqual({ status: 'ok' })

    const reordered = await db
      .select({
        mediaItemId: collectionItems.mediaItemId,
        sortOrder: collectionItems.sortOrder,
      })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collectionId))
    expect(reordered).toEqual(
      expect.arrayContaining([
        { mediaItemId: firstMediaId, sortOrder: 0 },
        { mediaItemId: secondMediaId, sortOrder: 1 },
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

  async function insertLibrary(
    publicId: string,
    ownerId: number,
    name: string,
  ) {
    const [row] = await db
      .insert(libraries)
      .values({ publicId, ownerId, name, type: 'Movies', dataSources: [] })
      .returning({ id: libraries.id })
    if (!row) throw new Error('Library fixture was not created')
    return row.id
  }

  async function insertMedia(
    publicId: string,
    libraryId: number,
    title: string,
    fileSize: number,
    matchId: string | null,
  ) {
    const [row] = await db
      .insert(mediaItems)
      .values({
        publicId,
        libraryId,
        filePath: `/${publicId}.mp4`,
        fileSize,
        fileMetadata: {},
        mediaType: 'video/mp4',
        title,
        metadata: {},
        scannedAt: new Date(),
        matchId,
      })
      .returning({ id: mediaItems.id })
    if (!row) throw new Error('Media fixture was not created')
    return row.id
  }

  async function insertCollection(
    publicId: string,
    ownerId: number,
    type: CollectionType,
    title: string,
  ) {
    const [row] = await db
      .insert(collections)
      .values({ publicId, userId: ownerId, type, title })
      .returning({ id: collections.id })
    if (!row) throw new Error('Collection fixture was not created')
    return row.id
  }
})
