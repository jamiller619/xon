import { type Client, createClient } from '@libsql/client'
import { MediaType } from '@xon/shared'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaItems } from '../../db/schema.ts'
import { getMediaByLibraryId } from '../../services/libraryService.ts'

describe('libraryService.getMediaByLibraryId', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)

    await client.execute(`CREATE TABLE media_items (
      id text PRIMARY KEY NOT NULL,
      created_at integer NOT NULL,
      updated_at integer,
      library_id text NOT NULL,
      match_id text,
      match_id_source text,
      file_path text NOT NULL,
      file_size integer NOT NULL,
      file_metadata text NOT NULL,
      media_type text DEFAULT 'application/octet-stream' NOT NULL,
      title text NOT NULL,
      description text,
      metadata text DEFAULT '{}' NOT NULL,
      drm_protected integer DEFAULT false NOT NULL,
      scanned_at integer NOT NULL,
      tags text DEFAULT '[]' NOT NULL
    )`)

    const now = new Date('2026-07-22T12:00:00.000Z')
    await db
      .insert(mediaItems)
      .values([
        makeMedia('video-1', 'library-1', 'Bravo', 'video/mp4', 200, now),
        makeMedia('audio-1', 'library-1', 'Alpha', 'audio/mpeg', 100, now),
        makeMedia('video-2', 'library-1', 'Charlie', 'video/mp4', 300, now),
        makeMedia('other-1', 'library-2', 'Other', 'video/mp4', 400, now),
      ])
  })

  afterEach(() => client.close())

  it('uses a zero-based page offset and reports the full total', async () => {
    const result = await getMediaByLibraryId(
      db,
      'library-1',
      { pageNumber: 2, pageSize: 2 },
      { field: 'title', order: 'asc' },
    )

    expect(result.data.map((item) => item.title)).toEqual(['Charlie'])
    expect(result.total).toBe(3)
  })

  it('applies the media type filter to rows and the total', async () => {
    const result = await getMediaByLibraryId(
      db,
      'library-1',
      { pageNumber: 1, pageSize: 10 },
      { field: 'fileSize', order: 'desc' },
      MediaType.MainType.Video,
    )

    expect(result.data.map((item) => item.id)).toEqual(['video-2', 'video-1'])
    expect(result.total).toBe(2)
  })
})

function makeMedia(
  id: string,
  libraryId: string,
  title: string,
  mediaType: string,
  fileSize: number,
  createdAt: Date,
) {
  return {
    id,
    libraryId,
    title,
    mediaType,
    fileSize,
    filePath: `/${id}`,
    fileMetadata: {},
    metadata: {},
    scannedAt: createdAt,
    createdAt,
  }
}
