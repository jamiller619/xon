import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { CollectionType } from '@xon/shared'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectionItems,
  collections,
  libraries,
  mediaItems,
  mediaPlayStates,
  users,
} from '../../db/schema.ts'
import { makeCollectionsRouter } from '../../routes/collections.ts'
import { makeScanRouter } from '../../routes/scan.ts'
import { makeUsersRouter } from '../../routes/users.ts'
import type { ScannerHandle } from '../../scanner/scannerHandle.ts'

vi.mock('../../lib/auth.ts', () => ({ default: {} }))

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

describe('database-free route adapters', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: Hono
  let databaseDirectory: string
  let userId: number
  let otherUserId: number
  let libraryId: number
  let collectionId: number
  let mediaId: number

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'xon-route-services-'))
    client = createClient({
      url: pathToFileURL(join(databaseDirectory, 'routes.db')).href,
    })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })

    userId = await insertUser('route-user', 'route@example.com')
    otherUserId = await insertUser('other-route-user', 'other@example.com')
    const [library] = await db
      .insert(libraries)
      .values({
        publicId: 'route-library',
        ownerId: userId,
        name: 'Route library',
        type: 'Movies',
        dataSources: [],
      })
      .returning({ id: libraries.id })
    if (!library) throw new Error('Library fixture was not created')
    libraryId = library.id
    const [media] = await db
      .insert(mediaItems)
      .values({
        publicId: 'route-media',
        libraryId,
        filePath: '/route-media.mp4',
        fileSize: 100,
        fileMetadata: {},
        mediaType: 'video/mp4',
        title: 'Route media',
        metadata: {},
        scannedAt: new Date(),
      })
      .returning({ id: mediaItems.id })
    if (!media) throw new Error('Media fixture was not created')
    mediaId = media.id
    const [collection] = await db
      .insert(collections)
      .values({
        publicId: 'route-collection',
        userId,
        type: CollectionType.Collection,
        title: 'Route collection',
      })
      .returning({ id: collections.id })
    if (!collection) throw new Error('Collection fixture was not created')
    collectionId = collection.id
    await db.insert(collectionItems).values({
      collectionId,
      mediaItemId: mediaId,
      sortOrder: 0,
    })
    await db.insert(collections).values([
      {
        publicId: 'auto-collection',
        userId,
        type: CollectionType.Favorites,
        title: 'Favorites',
      },
      {
        publicId: 'other-collection',
        userId: otherUserId,
        type: CollectionType.Collection,
        title: 'Other collection',
      },
    ])

    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user', {
        id: userId,
        publicId: 'route-user',
        name: 'Route user',
        email: 'route@example.com',
      } as never)
      c.set('session', { id: 1, publicId: 'route-session' } as never)
      await next()
    })
    app.route('/collections', makeCollectionsRouter(db))
    app.route('/users', makeUsersRouter(db))
    app.route(
      '/libraries/:libraryId/scan',
      makeScanRouter(db, {
        startScan: vi.fn(),
        refreshMetadata: vi.fn(),
      } as unknown as ScannerHandle),
    )
  })

  afterEach(async () => {
    client.close()
    await rm(databaseDirectory, { recursive: true, force: true })
  })

  it('preserves collection pagination, ownership, and mutation responses', async () => {
    const media = await app.request(
      '/collections/route-collection/media?limit=1',
    )
    expect(media.status).toBe(200)
    expect(media.headers.get('X-Total-Count')).toBe('1')
    expect(await media.json()).toMatchObject([
      { id: 'route-media', libraryId: 'route-library' },
    ])

    const hidden = await app.request('/collections/other-collection')
    expect(hidden.status).toBe(404)
    expect(await hidden.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Collection not found' },
    })

    const immutable = await app.request('/collections/auto-collection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nope' }),
    })
    expect(immutable.status).toBe(403)
    expect(await immutable.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Cannot update an auto-generated collection',
      },
    })

    const missingReorder = await app.request(
      '/collections/route-collection/items',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { mediaItemId: 'route-media', sortOrder: 9 },
            { mediaItemId: 'missing-media', sortOrder: 10 },
          ],
        }),
      },
    )
    expect(missingReorder.status).toBe(404)
    expect(await missingReorder.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'One or more collection items were not found',
      },
    })
  })

  it('preserves scan-schedule validation and missing-library mapping', async () => {
    const scheduled = await app.request(
      '/libraries/route-library/scan/schedule',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanSchedule: '0 */6 * * *' }),
      },
    )
    expect(scheduled.status).toBe(200)
    expect(await scheduled.json()).toMatchObject({
      id: 'route-library',
      scanSchedule: '0 */6 * * *',
    })

    const invalid = await app.request(
      '/libraries/route-library/scan/schedule',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanSchedule: '0 0 * * *' }),
      },
    )
    expect(invalid.status).toBe(400)

    const missing = await app.request('/libraries/missing/scan/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanSchedule: null }),
    })
    expect(missing.status).toBe(404)
  })

  it('preserves resumable and compact play-state response semantics', async () => {
    await db.insert(mediaPlayStates).values({
      userId,
      mediaItemId: mediaId,
      position: 100,
      duration: 100,
      status: 'completed',
    })

    const resumable = await app.request('/users/me/play-states')
    expect(resumable.status).toBe(200)
    expect(resumable.headers.get('Cache-Control')).toContain('no-store')
    expect(await resumable.json()).toEqual([])

    const progress = await app.request('/users/me/play-states/progress')
    expect(progress.status).toBe(200)
    expect(await progress.json()).toEqual([
      {
        mediaItemId: 'route-media',
        position: 100,
        duration: 100,
        status: 'completed',
      },
    ])
  })

  async function insertUser(publicId: string, email: string) {
    const [row] = await db
      .insert(users)
      .values({ publicId, name: publicId, email })
      .returning({ id: users.id })
    if (!row) throw new Error('User fixture was not created')
    return row.id
  }
})
