import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { generatePublicId } from '../../lib/publicId.ts'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id')
    .notNull()
    .unique('users_public_id_unique')
    .$defaultFn(() => generatePublicId()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false),
})
