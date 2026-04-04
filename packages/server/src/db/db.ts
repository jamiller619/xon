import { join } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { type LibSQLDatabase, drizzle } from 'drizzle-orm/libsql'
import { createLogger } from '../logger.js'

const logger = createLogger('db')

export type { LibSQLDatabase }

export async function openDatabase(
  url?: string,
): Promise<{ client: Client; db: LibSQLDatabase }> {
  const resolvedUrl = url ?? getDefaultDbUrl()
  logger.log(`Opening database: ${resolvedUrl}`)

  const client = createClient({ url: resolvedUrl })

  // Enable WAL mode for better concurrent read performance (file-based databases only)
  if (resolvedUrl !== ':memory:' && !resolvedUrl.includes(':memory:')) {
    await client.execute('PRAGMA journal_mode=WAL')
    logger.log('WAL mode enabled')
  }

  const db = drizzle(client)
  logger.log('Database ready')

  return { client, db }
}

function getDefaultDbUrl(): string {
  const dataDir = process.env.DATA_DIR ?? './data'

  return `file:${join(dataDir, 'xon.db')}`
}
