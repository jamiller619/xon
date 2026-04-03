import { join } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { type LibSQLDatabase, drizzle } from 'drizzle-orm/libsql'

export type { LibSQLDatabase }

export async function openDatabase(
  url?: string,
): Promise<{ client: Client; db: LibSQLDatabase }> {
  const resolvedUrl = url ?? getDefaultDbUrl()
  const client = createClient({ url: resolvedUrl })

  // Enable WAL mode for better concurrent read performance (file-based databases only)
  if (resolvedUrl !== ':memory:' && !resolvedUrl.includes(':memory:')) {
    await client.execute('PRAGMA journal_mode=WAL')
  }

  const db = drizzle(client)

  return { client, db }
}

function getDefaultDbUrl(): string {
  const dataDir = process.env.DATA_DIR ?? './data'

  return `file:${join(dataDir, 'xon.db')}`
}
