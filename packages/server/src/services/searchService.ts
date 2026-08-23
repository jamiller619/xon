import type { MediaItem } from '@xon/shared'
import { inArray, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { publicMediaColumns } from '../db/publicSelections.ts'
import { libraries, mediaItems } from '../db/schema.ts'

const MAX_SEARCH_TOKENS = 32

export interface SearchMediaOptions {
  userId: number
  query: string
  category?: string | undefined
  page: number
  limit: number
}

export interface SearchMediaPage {
  data: MediaItem[]
  total: number
}

interface RankedMediaId {
  id: number
}

interface CountRow {
  count: number
}

export interface PopularGenre {
  name: string
  count: number
}

interface PopularGenreRow {
  name: string
  count: number
}

/**
 * Converts user input to a literal FTS5 prefix query. Extracting words keeps
 * FTS operators and punctuation in user input from changing query semantics.
 */
export function toFtsQuery(query: string): string | null {
  const tokens = query.normalize('NFKC').match(/[\p{L}\p{N}]+/gu)
  if (!tokens) return null

  const uniqueTokens = [...new Set(tokens)].slice(0, MAX_SEARCH_TOKENS)
  if (uniqueTokens.length === 0) return null

  return uniqueTokens.map((token) => `"${token}"*`).join(' AND ')
}

export async function searchMedia(
  db: LibSQLDatabase,
  options: SearchMediaOptions,
): Promise<SearchMediaPage> {
  const matchQuery = toFtsQuery(options.query)
  if (!matchQuery) return { data: [], total: 0 }

  const offset = (options.page - 1) * options.limit
  const categoryFilter = options.category
    ? sql`AND library.content_type = ${options.category}`
    : sql``
  const [rankedRows, countRows] = await Promise.all([
    db.all<RankedMediaId>(sql`
      SELECT media_fts.id AS id
      FROM media_fts
      INNER JOIN media_items AS media ON media.id = media_fts.id
      INNER JOIN libraries AS library ON library.id = media.library_id
      WHERE media_fts MATCH ${matchQuery}
        AND library.owner_id = ${options.userId}
        ${categoryFilter}
      ORDER BY
        bm25(media_fts, 0.0, 10.0, 2.0, 1.0, 5.0, 3.0),
        lower(media.title),
        media.id
      LIMIT ${options.limit}
      OFFSET ${offset}
    `),
    db.all<CountRow>(sql`
      SELECT count(*) AS count
      FROM media_fts
      INNER JOIN media_items AS media ON media.id = media_fts.id
      INNER JOIN libraries AS library ON library.id = media.library_id
      WHERE media_fts MATCH ${matchQuery}
        AND library.owner_id = ${options.userId}
        ${categoryFilter}
    `),
  ])

  const ids = rankedRows.map((row) => row.id)
  if (ids.length === 0) {
    return { data: [], total: Number(countRows[0]?.count ?? 0) }
  }

  const rows = await db
    .select({
      ...publicMediaColumns,
      libraryId: libraries.publicId,
      internalId: mediaItems.id,
    })
    .from(mediaItems)
    .innerJoin(libraries, sql`${mediaItems.libraryId} = ${libraries.id}`)
    .where(inArray(mediaItems.id, ids))
  const rowsById = new Map(rows.map((row) => [row.internalId, row]))

  return {
    data: ids.flatMap((id) => {
      const row = rowsById.get(id)
      if (!row) return []
      const { internalId: _internalId, ...publicRow } = row
      return [publicRow]
    }),
    total: Number(countRows[0]?.count ?? 0),
  }
}

/**
 * Returns the genres used by the most media in a user's libraries. Genre names
 * are compared case-insensitively and duplicate values on one item count once.
 * The singular metadata.genre field keeps older and manually edited rows in
 * the result alongside the preferred metadata.genres array.
 */
export async function getPopularGenres(
  db: LibSQLDatabase,
  options: { userId: number; limit: number },
): Promise<PopularGenre[]> {
  const rows = await db.all<PopularGenreRow>(sql`
    WITH genre_values AS (
      SELECT
        media.id AS media_id,
        trim(CAST(genre.value AS TEXT)) AS name
      FROM media_items AS media
      INNER JOIN libraries AS library ON library.id = media.library_id
      INNER JOIN json_each(media.metadata, '$.genres') AS genre
      WHERE library.owner_id = ${options.userId}
        AND genre.type = 'text'

      UNION ALL

      SELECT
        media.id AS media_id,
        trim(CAST(json_extract(media.metadata, '$.genre') AS TEXT)) AS name
      FROM media_items AS media
      INNER JOIN libraries AS library ON library.id = media.library_id
      WHERE library.owner_id = ${options.userId}
        AND json_type(media.metadata, '$.genre') = 'text'
    ),
    media_genres AS (
      SELECT
        media_id,
        lower(name) AS normalized_name,
        min(name) AS name
      FROM genre_values
      WHERE name <> ''
      GROUP BY media_id, lower(name)
    )
    SELECT min(name) AS name, count(*) AS count
    FROM media_genres
    GROUP BY normalized_name
    ORDER BY count DESC, name COLLATE NOCASE, name
    LIMIT ${options.limit}
  `)

  return rows.map((row) => ({ name: row.name, count: Number(row.count) }))
}
