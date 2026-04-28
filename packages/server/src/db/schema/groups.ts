import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { libraries } from './libraries.js'
import { mediaItems } from './media.js'

export const GROUP_TYPES = [
  'series',
  'season',
  'album',
  'artist',
  'book-series',
  'collection',
  'playlist',
  'shelf',
  'folder',
] as const
export type GroupType = (typeof GROUP_TYPES)[number]

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    parentGroupId: text('parent_group_id'),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('groups_library_id_idx').on(table.libraryId),
    index('groups_parent_group_id_idx').on(table.parentGroupId),
  ],
)

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.mediaItemId] })],
)

export type Group = typeof groups.$inferSelect
export type NewGroup = typeof groups.$inferInsert
export type GroupMember = typeof groupMembers.$inferSelect
export type NewGroupMember = typeof groupMembers.$inferInsert
