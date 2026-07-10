import type { Metadata } from '@xon/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { libraries } from './libraries.ts'
import { keys, timestamps } from './shared.ts'

export const mediaItems = sqliteTable(
  'media_items',
  {
    ...keys,
    ...timestamps,
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id),
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size').notNull(),
    fileMetadata: text('file_metadata', { mode: 'json' })
      .$type<Metadata>()
      .notNull(),
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
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index('media_items_media_type_idx').on(table.mediaType),
    index('media_items_file_path_idx').on(table.filePath),
    index('media_items_title_idx').on(table.title),
  ],
)

export type MediaItem = typeof mediaItems.$inferSelect
export type NewMediaItem = typeof mediaItems.$inferInsert
