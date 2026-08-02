import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { type DataSource, DataSourceType } from '@xon/shared'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import {
  identifyDataSources,
  matchMediaSource,
  migrateRelativeMediaPaths,
} from '../../db/dataMigrations/relativeMediaPaths.js'

describe('relative media path migration', () => {
  it('assigns missing source ids without replacing existing ids', () => {
    const result = identifyDataSources([
      { type: DataSourceType.local, path: '/media' } as DataSource,
      { id: 'existing', type: DataSourceType.local, path: '/photos' },
    ])
    expect(result.changed).toBe(true)
    expect(result.sources[0]?.id).toBeTruthy()
    expect(result.sources[1]?.id).toBe('existing')
  })

  it('uses the most specific source for overlapping roots', () => {
    const sources: DataSource[] = [
      { id: 'root', type: DataSourceType.local, path: '/media' },
      { id: 'movies', type: DataSourceType.local, path: '/media/movies' },
    ]
    expect(matchMediaSource('/media/movies/Alien.mkv', sources)).toEqual({
      dataSourceId: 'movies',
      filePath: 'Alien.mkv',
    })
  })

  it('updates library sources and media provenance only once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xon-media-paths-'))
    const client = createClient({
      url: pathToFileURL(join(directory, 'xon.db')).href,
    })
    const db = drizzle(client)
    try {
      await db.run(sql`
        CREATE TABLE libraries (
          id text PRIMARY KEY NOT NULL,
          data_sources text NOT NULL
        )
      `)
      await db.run(sql`
        CREATE TABLE media_items (
          id text PRIMARY KEY NOT NULL,
          library_id text NOT NULL,
          data_source_id text,
          file_path text NOT NULL
        )
      `)
      await db.run(sql`
        INSERT INTO libraries (id, data_sources)
        VALUES ('library-1', '[{"type":"local","path":"/media"}]')
      `)
      await db.run(sql`
        INSERT INTO media_items (id, library_id, file_path)
        VALUES ('media-1', 'library-1', '/media/movies/Alien.mkv')
      `)

      await migrateRelativeMediaPaths(db)
      await migrateRelativeMediaPaths(db)

      const library = await db.all<{ data_sources: string }>(sql`
        SELECT data_sources FROM libraries WHERE id = 'library-1'
      `)
      const media = await db.all<{
        data_source_id: string
        file_path: string
      }>(sql`
        SELECT data_source_id, file_path FROM media_items WHERE id = 'media-1'
      `)
      const sources = JSON.parse(
        library[0]?.data_sources ?? '[]',
      ) as DataSource[]
      expect(sources[0]?.id).toBeTruthy()
      expect(media[0]).toEqual({
        data_source_id: sources[0]?.id,
        file_path: 'movies/Alien.mkv',
      })
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
