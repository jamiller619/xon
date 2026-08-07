import type { CollectionType } from '@xon/shared'
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

export const collections = sqliteTable(
  'collections',
  {
    ...keys,
    ...timestamps,
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<CollectionType>().notNull(),
    title: text('title').notNull(),
    parentCollectionId: text('parent_collection_id'),
    metadata: text('metadata').notNull().default('{}'),
  },
  (table) => [
    index('collections_type_idx').on(table.type),
    index('collections_title_idx').on(table.title),
  ],
)

export const collectionItems = sqliteTable(
  'collection_items',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    mediaItemId: text('media_item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.mediaItemId] })],
)

export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
export type CollectionMember = typeof collectionItems.$inferSelect
export type NewCollectionMember = typeof collectionItems.$inferInsert
