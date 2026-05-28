import { type Metadata, type MPARating, MPARatings } from '@xon/shared'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { libraries } from './libraries.ts'
import { keys, timestamps } from './shared.ts'

/**
 * Returns an array of allowed content ratings for the given maxContentRating,
 * or null if there is no restriction (maxContentRating === "none").
 */
export function getAllowedRatings(
  maxContentRating: MPARating | 'none' | 'unrated',
): MPARating[] | null {
  if (maxContentRating === 'none') return null
  const idx = MPARatings.indexOf(maxContentRating as MPARating)
  if (idx === -1) return null

  return MPARatings.slice(0, idx + 1)
}

export const mediaItems = sqliteTable(
  'media_items',
  {
    ...keys,
    ...timestamps,
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type'),
    title: text('title').notNull(),
    description: text('description'),
    metadata: text('metadata', { mode: 'json' })
      .$type<Metadata>()
      .notNull()
      .default({}),
    drmProtected: integer('drm_protected', { mode: 'boolean' })
      .notNull()
      .default(false),
    scannedAt: integer('scanned_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('media_items_library_id_idx').on(table.libraryId),
    index('media_items_mime_type_idx').on(table.mimeType),
    uniqueIndex('media_items_file_path_idx').on(table.filePath),
  ],
)

export const readingPositions = sqliteTable('reading_positions', {
  ...keys,
  mediaItemId: text('media_item_id')
    .notNull()
    .unique()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  cfi: text('cfi').notNull(),
  chapterTitle: text('chapter_title'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type MediaItem = typeof mediaItems.$inferSelect
export type NewMediaItem = typeof mediaItems.$inferInsert
export type ReadingPosition = typeof readingPositions.$inferSelect
export type NewReadingPosition = typeof readingPositions.$inferInsert
