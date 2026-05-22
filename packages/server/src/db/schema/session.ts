import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { keys } from './shared.ts'
import { users } from './users.ts'

export const sessions = sqliteTable('sessions', {
  ...keys,
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
