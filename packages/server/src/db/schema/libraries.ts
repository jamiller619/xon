import type { DataSource, LibraryType } from '@xon/shared'
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { mediaItems } from './media.ts'
import { keys, timestamps } from './shared.ts'
import { users } from './users.ts'

export const libraries = sqliteTable('libraries', {
  ...keys,
  ...timestamps,
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  types: text('types', { mode: 'json' }).$type<LibraryType[]>().notNull(),
  // mediaTypes: text('media_types', { mode: 'json' })
  //   .$type<MediaType.MainType[]>()
  //   .notNull(),
  // mediaCategories: text('media_categories', { mode: 'json' })
  //   .$type<MediaCategory[]>()
  //   .notNull(),
  scanSchedule: text('scan_schedule'),
  // lang: text('lang').notNull().default('en-US'),Hey
  dataSources: text('data_sources', { mode: 'json' })
    .$type<DataSource[]>()
    .notNull(),
})

export const libraryMediaItems = sqliteTable(
  'library_media_items',
  {
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id),
  },
  (table) => [primaryKey({ columns: [table.libraryId, table.mediaItemId] })],
)

export type Library = typeof libraries.$inferSelect
export type NewLibrary = typeof libraries.$inferInsert
