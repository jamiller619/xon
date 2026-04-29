import { integer, text } from 'drizzle-orm/sqlite-core'

export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}

export const keys = {
  id: text('id').primaryKey(),
}
