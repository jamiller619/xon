import { integer, text } from 'drizzle-orm/sqlite-core'
import { generatePublicId } from '../../lib/publicId.ts'

export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}

export function keys(tableName: string) {
  return {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicId: text('public_id')
      .notNull()
      .unique(`${tableName}_public_id_unique`)
      .$defaultFn(() => generatePublicId()),
  }
}
