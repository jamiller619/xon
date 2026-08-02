import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import {
  migrateLibraryArtworkImages,
  migrateLocalArtworkMetadata,
  migrateRelativeLocalArtworkPaths,
  migrateRelativeThumbnailPaths,
  migrateThumbnailMetadata,
} from '../../db/dataMigrations/relativeThumbnailPaths.js'

describe('relative thumbnail path data migration', () => {
  it('runs once when the migration ledger starts empty', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xon-thumbnail-migration-'))
    const client = createClient({
      url: pathToFileURL(join(directory, 'xon.db')).href,
    })
    const db = drizzle(client)

    try {
      await db.run(sql`
        CREATE TABLE media_items (
          id text PRIMARY KEY NOT NULL,
          metadata text DEFAULT '{}' NOT NULL
        )
      `)

      await expect(migrateRelativeThumbnailPaths(db)).resolves.toBeUndefined()
      await expect(migrateRelativeThumbnailPaths(db)).resolves.toBeUndefined()

      const rows = await db.all<{ id: string }>(sql`
        SELECT id FROM xon_data_migrations
        WHERE id = '0003_relative_thumbnail_paths'
      `)
      expect(rows).toHaveLength(1)
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('migrates media and library artwork records once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xon-artwork-migration-'))
    const client = createClient({
      url: pathToFileURL(join(directory, 'xon.db')).href,
    })
    const db = drizzle(client)

    try {
      await db.run(sql`
        CREATE TABLE media_items (
          id text PRIMARY KEY NOT NULL,
          metadata text DEFAULT '{}' NOT NULL
        )
      `)
      await db.run(sql`
        CREATE TABLE libraries (
          id text PRIMARY KEY NOT NULL,
          images text DEFAULT '{"poster":[]}' NOT NULL
        )
      `)
      await db.run(sql`
        INSERT INTO media_items (id, metadata) VALUES (
          'media-1',
          '{"images":{"backdrop":["/old/cache/media-images/media-1/backdrop.jpg"]}}'
        )
      `)
      await db.run(sql`
        INSERT INTO libraries (id, images) VALUES (
          'library-1',
          '{"poster":["/old/cache/library-images/library-1/poster.png"]}'
        )
      `)

      await expect(
        migrateRelativeLocalArtworkPaths(db),
      ).resolves.toBeUndefined()
      await expect(
        migrateRelativeLocalArtworkPaths(db),
      ).resolves.toBeUndefined()

      const media = await db.all<{ metadata: string }>(sql`
        SELECT metadata FROM media_items WHERE id = 'media-1'
      `)
      const library = await db.all<{ images: string }>(sql`
        SELECT images FROM libraries WHERE id = 'library-1'
      `)
      expect(JSON.parse(media[0]?.metadata ?? '{}')).toMatchObject({
        images: { backdrop: ['media-images/media-1/backdrop.jpg'] },
      })
      expect(JSON.parse(library[0]?.images ?? '{}')).toEqual({
        poster: ['library-images/library-1/poster.png'],
      })
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('converts generated Unix paths and their generated poster source', () => {
    const result = migrateThumbnailMetadata({
      images: {
        poster: [
          {
            src: '/old/cache/thumbnails/media-1_large.jpg',
            thumbnails: {
              small: '/old/cache/thumbnails/media-1_small.jpg',
              medium: '/old/cache/thumbnails/media-1_medium.jpg',
              large: '/old/cache/thumbnails/media-1_large.jpg',
            },
          },
        ],
      },
    })

    expect(result.changed).toBe(true)
    expect(result.metadata.images?.poster).toEqual([
      {
        src: 'thumbnails/media-1_large.jpg',
        thumbnails: {
          small: 'thumbnails/media-1_small.jpg',
          medium: 'thumbnails/media-1_medium.jpg',
          large: 'thumbnails/media-1_large.jpg',
        },
      },
    ])
  })

  it('converts Windows paths to portable separators', () => {
    const result = migrateThumbnailMetadata({
      images: {
        poster: {
          src: String.raw`C:\old\cache\thumbnails\media-1_large.jpg`,
          thumbnails: {
            small: String.raw`C:\old\cache\thumbnails\media-1_small.jpg`,
            medium: String.raw`C:\old\cache\thumbnails\media-1_medium.jpg`,
            large: String.raw`C:\old\cache\thumbnails\media-1_large.jpg`,
          },
        },
      },
    })

    expect(result.metadata.images?.poster).toMatchObject({
      src: 'thumbnails/media-1_large.jpg',
      thumbnails: { small: 'thumbnails/media-1_small.jpg' },
    })
  })

  it('preserves embedded, remote, legacy, and already-relative artwork', () => {
    const metadata = {
      images: {
        poster: [
          'https://example.com/poster.jpg',
          {
            src: '/data/images/media-1_cover.jpg',
            thumbnails: {
              small: 'thumbnails/media-1_small.jpg',
              medium: 'thumbnails/media-1_medium.jpg',
              large: 'thumbnails/media-1_large.jpg',
            },
          },
          { src: 'https://example.com/thumbnails/poster.jpg' },
        ],
      },
    }

    const result = migrateThumbnailMetadata(metadata)
    expect(result.changed).toBe(false)
    expect(result.metadata).toBe(metadata)
  })

  it('converts cached posters, backdrops, and logos outside thumbnails', () => {
    const result = migrateLocalArtworkMetadata({
      images: {
        poster: ['/old/cache/media-images/media-1/uploaded.png'],
        backdrop: [String.raw`C:\old\cache\media-images\media-1\backdrop.jpg`],
        logo: ['/old/cache/media-images/media-1/logo.webp'],
      },
    })

    expect(result.changed).toBe(true)
    expect(result.metadata.images).toEqual({
      poster: ['media-images/media-1/uploaded.png'],
      backdrop: ['media-images/media-1/backdrop.jpg'],
      logo: ['media-images/media-1/logo.webp'],
    })
  })

  it('converts cached library artwork without changing remote images', () => {
    const result = migrateLibraryArtworkImages({
      poster: [
        '/old/cache/library-images/library-1/poster.png',
        'https://example.com/poster.png',
      ],
    })

    expect(result).toEqual({
      changed: true,
      images: {
        poster: [
          'library-images/library-1/poster.png',
          'https://example.com/poster.png',
        ],
      },
    })
  })
})
