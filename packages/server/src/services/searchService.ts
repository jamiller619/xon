import { genreNameFromTag, genreTag, type MediaItem } from '@xon/shared'
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

interface PopularGenreValueRow {
  media_id: number
  value: string
  tag_source: number
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
 * come from canonical tags and duplicate values on one item count once. Rows
 * without canonical tags temporarily fall back to plural or singular metadata.
 */
export async function getPopularGenres(
  db: LibSQLDatabase,
  options: { userId: number; limit: number },
): Promise<PopularGenre[]> {
  const rows = await db.all<PopularGenreValueRow>(sql`
    WITH media_scope AS (
      SELECT media.id, media.tags, media.metadata
      FROM media_items AS media
      INNER JOIN libraries AS library ON library.id = media.library_id
      WHERE library.owner_id = ${options.userId}
    ),
    tag_genres AS (
      SELECT
        media.id AS media_id,
        trim(CAST(tag.value AS TEXT)) AS value,
        1 AS tag_source
      FROM media_scope AS media
      INNER JOIN json_each(media.tags) AS tag
      WHERE tag.type = 'text'
        AND lower(trim(CAST(tag.value AS TEXT))) LIKE 'genre:%'
        AND trim(substr(CAST(tag.value AS TEXT), 7)) <> ''
    ),
    metadata_genres AS (
      SELECT
        media.id AS media_id,
        trim(CAST(genre.value AS TEXT)) AS value,
        0 AS tag_source
      FROM media_scope AS media
      INNER JOIN json_each(media.metadata, '$.genres') AS genre
      WHERE genre.type = 'text'

      UNION ALL

      SELECT
        media.id AS media_id,
        trim(CAST(json_extract(media.metadata, '$.genre') AS TEXT)) AS value,
        0 AS tag_source
      FROM media_scope AS media
      WHERE json_type(media.metadata, '$.genre') = 'text'
    )
    SELECT media_id, value, tag_source FROM tag_genres
    UNION ALL
    SELECT media_id, value, tag_source FROM metadata_genres
  `)

  const valuesByMedia = new Map<
    number,
    { tagValues: string[]; metadataValues: string[] }
  >()
  for (const row of rows) {
    const values = valuesByMedia.get(row.media_id) ?? {
      tagValues: [],
      metadataValues: [],
    }
    if (row.tag_source) values.tagValues.push(row.value)
    else values.metadataValues.push(row.value)
    valuesByMedia.set(row.media_id, values)
  }

  const counts = new Map<string, PopularGenre>()
  for (const values of valuesByMedia.values()) {
    const tagGenres = values.tagValues.flatMap((value) => {
      const name = genreNameFromTag(value)
      const tag = name ? genreTag(name) : undefined
      return tag ? [tag] : []
    })
    const candidates =
      tagGenres.length > 0
        ? tagGenres
        : values.metadataValues.flatMap((value) => {
            const tag = genreTag(value)
            return tag ? [tag] : []
          })

    for (const canonicalTag of new Set(candidates)) {
      const existing = counts.get(canonicalTag)
      if (existing) {
        existing.count += 1
        continue
      }
      const name = genreNameFromTag(canonicalTag)
      if (name) counts.set(canonicalTag, { name, count: 1 })
    }
  }

  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        }) ||
        left.name.localeCompare(right.name),
    )
    .slice(0, options.limit)
}
