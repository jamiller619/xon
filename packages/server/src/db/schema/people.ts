import type { Metadata } from '@xon/shared'
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { mediaItems } from './media.ts'
import { keys } from './shared.ts'

export const people = sqliteTable(
  'people',
  {
    ...keys,
    name: text('name').notNull(),
    description: text('description'),
    avatarUrl: text('avatar_url'),
    metadata: text('metadata', { mode: 'json' })
      .$type<Metadata>()
      .notNull()
      .default({}),
  },
  (table) => [uniqueIndex('people_name_idx').on(table.name)],
)

export const peopleMedia = sqliteTable(
  'people_media',
  {
    ...keys,
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    order: integer('order'),
  },
  (table) => [
    uniqueIndex('people_media_person_media_role_idx').on(
      table.personId,
      table.mediaId,
      table.role,
    ),
  ],
)
