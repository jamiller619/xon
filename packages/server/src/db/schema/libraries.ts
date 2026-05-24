import type { DataSource, MediaCategory } from '@xon/shared'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
  mediaCategories: text('media_categories', { mode: 'json' })
    .$type<MediaCategory[]>()
    .notNull(),
  scanSchedule: text('scan_schedule'),
  dataSources: text('data_sources', { mode: 'json' })
    .$type<DataSource[]>()
    .notNull(),
})

export type Library = typeof libraries.$inferSelect
export type NewLibrary = typeof libraries.$inferInsert
