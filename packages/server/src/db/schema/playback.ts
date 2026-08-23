import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { mediaItems } from './media.ts'
import { users } from './users.ts'

export const mediaPlayStates = sqliteTable(
  'media_play_states',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaItemId: integer('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    duration: integer('duration'),
    status: text('status', {
      enum: ['playing', 'stopped', 'completed'],
    })
      .notNull()
      .default('playing'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
    stoppedAt: integer('stopped_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaItemId] }),
    index('media_play_states_user_updated_idx').on(
      table.userId,
      table.updatedAt,
    ),
  ],
)

export type MediaPlayState = typeof mediaPlayStates.$inferSelect
export type NewMediaPlayState = typeof mediaPlayStates.$inferInsert
