import type { DataSourceType, MediaCategory } from '@xon/shared'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { keys, timestamps } from './shared.ts'

export const libraries = sqliteTable('libraries', {
  ...keys,
  ...timestamps,
  name: text('name').notNull(),
  description: text('description'),
  mediaCategories: text('media_categories', { mode: 'json' })
    .$type<MediaCategory[]>()
    .notNull(),
  scanSchedule: text('scan_schedule'),
  watchEnabled: integer('watch_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  lastScanResult: text('last_scan_result'),
  lastScanDuration: integer('last_scan_duration'),
  hideDRMItems: integer('hide_drm_items', { mode: 'boolean' })
    .notNull()
    .default(false),
})

export const dataSources = sqliteTable('data_sources', {
  ...keys,
  ...timestamps,
  libraryId: text('library_id')
    .notNull()
    .references(() => libraries.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['local', 'network', 'plugin'] })
    .$type<DataSourceType>()
    .notNull(),
  path: text('path').notNull(),
  pluginId: text('plugin_id'),
  // recursive: integer('recursive', { mode: 'boolean' }).notNull().default(true),
  // enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})

export type Library = typeof libraries.$inferSelect
export type NewLibrary = typeof libraries.$inferInsert
export type DataSource = typeof dataSources.$inferSelect
export type NewDataSource = typeof dataSources.$inferInsert
