import { sql } from 'drizzle-orm'
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const backupTargets = sqliteTable('backup_targets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['local', 'network', 'plugin'] })
    .notNull()
    .default('local'),
  config: text('config').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  removeDeleted: integer('remove_deleted', { mode: 'boolean' })
    .notNull()
    .default(false),
  schedule: text('schedule'),
  retentionKeepCount: integer('retention_keep_count'),
  retentionKeepDays: integer('retention_keep_days'),
  nextScheduledAt: integer('next_scheduled_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const backupJobs = sqliteTable('backup_jobs', {
  id: text('id').primaryKey(),
  targetId: text('target_id')
    .notNull()
    .references(() => backupTargets.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull().default('{}'),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  totalFiles: integer('total_files').notNull().default(0),
  copiedFiles: integer('copied_files').notNull().default(0),
  skippedFiles: integer('skipped_files').notNull().default(0),
  errors: text('errors').notNull().default('[]'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const backupFileState = sqliteTable(
  'backup_file_state',
  {
    id: text('id').primaryKey(),
    targetId: text('target_id')
      .notNull()
      .references(() => backupTargets.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size').notNull().default(0),
    mtime: integer('mtime').notNull().default(0),
    checksum: text('checksum'),
    backedUpAt: integer('backed_up_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('backup_file_state_target_path_idx').on(t.targetId, t.filePath),
  ],
)

export const backupVerifyJobs = sqliteTable('backup_verify_jobs', {
  id: text('id').primaryKey(),
  targetId: text('target_id')
    .notNull()
    .references(() => backupTargets.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  totalFiles: integer('total_files').notNull().default(0),
  passedFiles: integer('passed_files').notNull().default(0),
  failedFiles: integer('failed_files').notNull().default(0),
  missingFiles: integer('missing_files').notNull().default(0),
  failedItems: text('failed_items').notNull().default('[]'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type BackupTarget = typeof backupTargets.$inferSelect
export type NewBackupTarget = typeof backupTargets.$inferInsert
export type BackupJob = typeof backupJobs.$inferSelect
export type NewBackupJob = typeof backupJobs.$inferInsert
export type BackupFileState = typeof backupFileState.$inferSelect
export type NewBackupFileState = typeof backupFileState.$inferInsert
export type BackupVerifyJob = typeof backupVerifyJobs.$inferSelect
export type NewBackupVerifyJob = typeof backupVerifyJobs.$inferInsert
