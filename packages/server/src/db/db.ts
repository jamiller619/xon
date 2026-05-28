import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import config from '../config.ts'
import { createLogger } from '../logger.ts'

const logger = createLogger('db')

export type { LibSQLDatabase }

const dbPath = path.join(config.get('appdata.dbPath'), 'xon.db')
const dbUrl = pathToFileURL(dbPath).href

logger.log(`Opening database: ${dbUrl}`)

await fsp.mkdir(path.dirname(dbPath), { recursive: true })

export const client = createClient({ url: dbUrl })

if (dbUrl !== ':memory:' && !dbUrl.includes(':memory:')) {
  await client.execute('PRAGMA journal_mode=WAL')

  logger.log('WAL mode enabled')
}

const db = drizzle(client)

export default db

logger.log('Database ready')
