import type { GroupType } from '@xon/shared'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { mediaItems } from './media.ts'
import { keys, timestamps } from './shared.ts'
import { users } from './users.ts'

export const groups = sqliteTable(
  'groups',
  {
    ...keys,
    ...timestamps,
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<GroupType>().notNull(),
    title: text('title').notNull(),
    parentGroupId: text('parent_group_id'),
    metadata: text('metadata').notNull().default('{}'),
  },
  (table) => [
    index('groups_type_idx').on(table.type),
    index('groups_title_idx').on(table.title),
  ],
)

export const groupItems = sqliteTable(
  'group_items',
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
export type GroupMember = typeof groupItems.$inferSelect
export type NewGroupMember = typeof groupItems.$inferInsert
