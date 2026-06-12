import { type Metadata, type MPARating, MPARatings } from '@xon/shared'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { keys, timestamps } from './shared.ts'

/**
 * Returns an array of allowed content ratings for the given maxContentRating,
 * or null if there is no restriction (maxContentRating === "none").
 */
// export function getAllowedRatings(
//   maxContentRating: MPARating | 'none' | 'unrated',
// ): MPARating[] | null {
//   if (maxContentRating === 'none') return null
//   const idx = MPARatings.indexOf(maxContentRating as MPARating)
//   if (idx === -1) return null

//   return MPARatings.slice(0, idx + 1)
// }

export const mediaItems = sqliteTable(
  'media_items',
  {
    ...keys,
    ...timestamps,
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size').notNull(),
    mediaType: text('media_type').notNull().default('application/octet-stream'),
    title: text('title').notNull(),
    description: text('description'),
    metadata: text('metadata', { mode: 'json' })
      .$type<Metadata>()
      .notNull()
      .default({}),
    drmProtected: integer('drm_protected', { mode: 'boolean' })
      .notNull()
      .default(false),
    scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
    genres: text('genres', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index('media_items_media_type_idx').on(table.mediaType),
    uniqueIndex('media_items_file_path_idx').on(table.filePath),
    index('media_items_title_idx').on(table.title),
  ],
)

// export const readingPositions = sqliteTable('reading_positions', {
//   ...keys,
//   mediaItemId: text('media_item_id')
//     .notNull()
//     .unique()
//     .references(() => mediaItems.id, { onDelete: 'cascade' }),
//   cfi: text('cfi').notNull(),
//   chapterTitle: text('chapter_title'),
//   updatedAt: integer('updated_at', { mode: 'timestamp' })
//     .notNull()
//     .default(sql`(unixepoch())`),
// })

export type MediaItem = typeof mediaItems.$inferSelect
export type NewMediaItem = typeof mediaItems.$inferInsert
// export type ReadingPosition = typeof readingPositions.$inferSelect
// export type NewReadingPosition = typeof readingPositions.$inferInsert
