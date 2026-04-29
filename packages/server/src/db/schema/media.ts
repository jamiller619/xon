import {
  type MPARating,
  MPARatings,
  type MediaImageType,
  MediaImageTypes,
} from '@xon/shared'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { libraries } from './libraries.js'
import { keys, timestamps } from './shared.js'

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
    // dataSourceId: text('data_source_id')
    //   .notNull()
    //   .references(() => dataSources.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type'),
    // TODO: Rename to "category"
    mediaCategory: text('media_category'),
    // TODO: Rename to "rating"
    // contentRating: text('content_rating', {
    //   enum: ['G', 'PG', 'PG-13', 'R', 'unrated'],
    // }),
    title: text('title'),
    description: text('description'),
    metadata: text('metadata').notNull().default('{}'),
    // thumbnailPaths: text('thumbnail_paths'),
    drmProtected: integer('drm_protected', { mode: 'boolean' })
      .notNull()
      .default(false),
    scannedAt: integer('scanned_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('media_items_library_id_idx').on(table.libraryId),
    index('media_items_media_category_idx').on(table.mediaCategory),
    index('media_items_file_path_idx').on(table.filePath),
  ],
)

export const mediaImages = sqliteTable('media_images', {
  ...keys,
  ...timestamps,
  mediaItemId: text('media_item_id')
    .notNull()
    .references(() => mediaItems.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  type: text('type', { enum: MediaImageTypes })
    .$type<MediaImageType>()
    .notNull(),
})

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
export type MediaImage = typeof mediaImages.$inferSelect
export type NewMediaImage = typeof mediaImages.$inferInsert
export type ReadingPosition = typeof readingPositions.$inferSelect
export type NewReadingPosition = typeof readingPositions.$inferInsert
