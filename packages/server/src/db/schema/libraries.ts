import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  allowedMediaTypes: text('allowed_media_types').notNull().default('[]'),
  scanSchedule: text('scan_schedule'),
  watchEnabled: integer('watch_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  lastScanResult: text('last_scan_result'),
  lastScanDuration: integer('last_scan_duration'),
  hideDrmItems: integer('hide_drm_items', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const dataSources = sqliteTable('data_sources', {
  id: text('id').primaryKey(),
  libraryId: text('library_id')
    .notNull()
    .references(() => libraries.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['local', 'network', 'plugin'] }).notNull(),
  path: text('path').notNull(),
  pluginId: text('plugin_id'),
  recursive: integer('recursive', { mode: 'boolean' }).notNull().default(true),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type Library = typeof libraries.$inferSelect
export type NewLibrary = typeof libraries.$inferInsert
export type DataSource = typeof dataSources.$inferSelect
export type NewDataSource = typeof dataSources.$inferInsert
