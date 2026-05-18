import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { createLogger } from '../logger.ts'

const logger = createLogger('db')

export type { LibSQLDatabase }

export async function openDatabase(
  dbPath: string,
): Promise<{ client: Client; db: LibSQLDatabase }> {
  const url = pathToFileURL(dbPath)
  const urlString = url.toString()

  logger.log(`Opening database: ${url}`)

  await fsp.mkdir(path.dirname(dbPath), { recursive: true })

  const client = createClient({ url: urlString })

  // Enable WAL mode for better concurrent read performance (file-based databases only)
  if (urlString !== ':memory:' && !urlString.includes(':memory:')) {
    await client.execute('PRAGMA journal_mode=WAL')

    logger.log('WAL mode enabled')
  }

  const db = drizzle(client)

  logger.log('Database ready')

  return { client, db }
}
