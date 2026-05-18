import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

export abstract class Repository {
  db: LibSQLDatabase
  #client: Client

  constructor(db: LibSQLDatabase, client: Client) {
    this.db = db
    this.#client = client
  }

  shutdown() {
    this.#client.close()
  }
}
