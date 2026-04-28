import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { dataSources, libraries } from './libraries.js'

export const CONTENT_RATINGS = [
  'G',
  'PG',
  'PG-13',
  'R',
  'unrated',
  'none',
] as const
export type ContentRatingMax = (typeof CONTENT_RATINGS)[number]

export const MEDIA_CONTENT_RATINGS = [
  'G',
  'PG',
  'PG-13',
  'R',
  'unrated',
] as const
export type MediaContentRating = (typeof MEDIA_CONTENT_RATINGS)[number]

// Rating order index: G=0, PG=1, PG-13=2, R=3, unrated=4. "none" = no restriction.
export const RATING_ORDER: MediaContentRating[] = [
  'G',
  'PG',
  'PG-13',
  'R',
  'unrated',
]

/**
 * Returns an array of allowed content ratings for the given maxContentRating,
 * or null if there is no restriction (maxContentRating === "none").
 */
export function getAllowedRatings(
  maxContentRating: ContentRatingMax,
): MediaContentRating[] | null {
  if (maxContentRating === 'none') return null
  const idx = RATING_ORDER.indexOf(maxContentRating as MediaContentRating)
  if (idx === -1) return null
  return RATING_ORDER.slice(0, idx + 1)
}

export const mediaItems = sqliteTable(
  'media_items',
  {
    id: text('id').primaryKey(),
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    dataSourceId: text('data_source_id')
      .notNull()
      .references(() => dataSources.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type'),
    mediaCategory: text('media_category'),
    contentRating: text('content_rating', {
      enum: ['G', 'PG', 'PG-13', 'R', 'unrated'],
    }),
    title: text('title'),
    description: text('description'),
    metadata: text('metadata').notNull().default('{}'),
    thumbnailPaths: text('thumbnail_paths'),
    drmProtected: integer('drm_protected', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    scannedAt: integer('scanned_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('media_items_library_id_idx').on(table.libraryId),
    index('media_items_media_category_idx').on(table.mediaCategory),
    index('media_items_file_path_idx').on(table.filePath),
  ],
)

export const readingPositions = sqliteTable('reading_positions', {
  id: text('id').primaryKey(),
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
