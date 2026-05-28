import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'

export function createDB(dbUrl: string): LibSQLDatabase {
  const readonlyURL = `${dbUrl}?mode=ro`

  return drizzle(createClient({ url: readonlyURL }))
}
