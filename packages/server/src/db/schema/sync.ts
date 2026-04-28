import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const syncProfiles = sqliteTable('sync_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['full', 'partial'] })
    .notNull()
    .default('full'),
  scope: text('scope').notNull().default('{}'),
  targetPath: text('target_path').notNull(),
  includeMedia: integer('include_media', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const syncRuns = sqliteTable('sync_runs', {
  id: text('id').primaryKey(),
  profileId: text('profile_id')
    .notNull()
    .references(() => syncProfiles.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  totalItems: integer('total_items').notNull().default(0),
  syncedItems: integer('synced_items').notNull().default(0),
  errors: text('errors').notNull().default('[]'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type SyncProfile = typeof syncProfiles.$inferSelect
export type NewSyncProfile = typeof syncProfiles.$inferInsert
export type SyncRun = typeof syncRuns.$inferSelect
export type NewSyncRun = typeof syncRuns.$inferInsert
