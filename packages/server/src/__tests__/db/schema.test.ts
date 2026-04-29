import type { Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import { dataSources, libraries, mediaItems } from '../../db/schema.js'

describe('schema', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
  })

  afterEach(() => {
    client.close()
  })

  describe('libraries table', () => {
    it('inserts and retrieves a library', async () => {
      await db.insert(libraries).values({
        id: 'lib-1',
        name: 'My Movies',
        description: 'Movie collection',
        mediaTypes: '["Movies"]',
      })

      const rows = await db.select().from(libraries)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe('lib-1')
      expect(rows[0]?.name).toBe('My Movies')
      expect(rows[0]?.description).toBe('Movie collection')
      expect(rows[0]?.mediaTypes).toBe('["Movies"]')
    })

    it('uses empty array as default for mediaTypes', async () => {
      await db.insert(libraries).values({ id: 'lib-2', name: 'Empty Library' })

      const rows = await db.select().from(libraries)
      expect(rows[0]?.mediaTypes).toBe('[]')
    })

    it('populates createdAt and updatedAt with defaults', async () => {
      await db.insert(libraries).values({ id: 'lib-3', name: 'Timestamped' })

      const rows = await db.select().from(libraries)
      const row = rows[0]
      expect(row?.createdAt).toBeInstanceOf(Date)
      expect(row?.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('data_sources table', () => {
    beforeEach(async () => {
      await db.insert(libraries).values({ id: 'lib-1', name: 'Test Library' })
    })

    it('inserts and retrieves a data source', async () => {
      await db.insert(dataSources).values({
        id: 'ds-1',
        libraryId: 'lib-1',
        type: 'local',
        path: '/media/movies',
        recursive: true,
        enabled: true,
      })

      const rows = await db.select().from(dataSources)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe('ds-1')
      expect(rows[0]?.libraryId).toBe('lib-1')
      expect(rows[0]?.type).toBe('local')
      expect(rows[0]?.path).toBe('/media/movies')
      expect(rows[0]?.recursive).toBe(true)
      expect(rows[0]?.enabled).toBe(true)
    })

    it('supports network type data sources', async () => {
      await db.insert(dataSources).values({
        id: 'ds-2',
        libraryId: 'lib-1',
        type: 'network',
        path: 'smb://server/share',
      })

      const rows = await db.select().from(dataSources)
      expect(rows[0]?.type).toBe('network')
    })

    it('cascades delete to data sources when library is deleted', async () => {
      await db.insert(dataSources).values({
        id: 'ds-1',
        libraryId: 'lib-1',
        type: 'local',
        path: '/media',
      })

      await db.delete(libraries).where(eq(libraries.id, 'lib-1'))
      const dsRows = await db.select().from(dataSources)
      expect(dsRows).toHaveLength(0)
    })
  })

  describe('media_items table', () => {
    beforeEach(async () => {
      await db.insert(libraries).values({ id: 'lib-1', name: 'Test Library' })
      await db.insert(dataSources).values({
        id: 'ds-1',
        libraryId: 'lib-1',
        type: 'local',
        path: '/media',
      })
    })

    it('inserts and retrieves a media item', async () => {
      await db.insert(mediaItems).values({
        id: 'item-1',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/movies/movie.mkv',
        fileName: 'movie.mkv',
        fileSize: 1024 * 1024 * 1024,
        mimeType: 'video/x-matroska',
        mediaCategory: 'Movies',
        title: 'My Movie',
      })

      const rows = await db.select().from(mediaItems)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe('item-1')
      expect(rows[0]?.filePath).toBe('/media/movies/movie.mkv')
      expect(rows[0]?.fileName).toBe('movie.mkv')
      expect(rows[0]?.fileSize).toBe(1024 * 1024 * 1024)
      expect(rows[0]?.mimeType).toBe('video/x-matroska')
      expect(rows[0]?.mediaCategory).toBe('Movies')
      expect(rows[0]?.title).toBe('My Movie')
    })

    it('uses default values for optional fields', async () => {
      await db.insert(mediaItems).values({
        id: 'item-2',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/song.mp3',
        fileName: 'song.mp3',
        fileSize: 5000000,
      })

      const rows = await db.select().from(mediaItems)
      expect(rows[0]?.metadata).toBe('{}')
      expect(rows[0]?.drmProtected).toBe(false)
      expect(rows[0]?.createdAt).toBeInstanceOf(Date)
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date)
      expect(rows[0]?.scannedAt).toBeNull()
    })

    it('stores and retrieves JSON metadata', async () => {
      const meta = JSON.stringify({
        duration: 7200,
        codec: 'h264',
        resolution: '1920x1080',
      })
      await db.insert(mediaItems).values({
        id: 'item-3',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/film.mp4',
        fileName: 'film.mp4',
        fileSize: 2000000000,
        metadata: meta,
      })

      const rows = await db.select().from(mediaItems)
      expect(rows[0]?.metadata).toBe(meta)
    })

    it('supports drmProtected flag', async () => {
      await db.insert(mediaItems).values({
        id: 'item-4',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/protected.m4v',
        fileName: 'protected.m4v',
        fileSize: 500000000,
        drmProtected: true,
      })

      const rows = await db.select().from(mediaItems)
      expect(rows[0]?.drmProtected).toBe(true)
    })

    it('cascades delete when library is deleted', async () => {
      await db.insert(mediaItems).values({
        id: 'item-5',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/song.mp3',
        fileName: 'song.mp3',
        fileSize: 5000000,
      })

      await db.delete(libraries).where(eq(libraries.id, 'lib-1'))
      const rows = await db.select().from(mediaItems)
      expect(rows).toHaveLength(0)
    })

    it('cascades delete when data source is deleted', async () => {
      await db.insert(mediaItems).values({
        id: 'item-6',
        libraryId: 'lib-1',
        dataSourceId: 'ds-1',
        filePath: '/media/song.mp3',
        fileName: 'song.mp3',
        fileSize: 5000000,
      })

      await db.delete(dataSources).where(eq(dataSources.id, 'ds-1'))
      const rows = await db.select().from(mediaItems)
      expect(rows).toHaveLength(0)
    })
  })
})
