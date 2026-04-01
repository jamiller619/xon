import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { users } from '../db/schema.js'
import { ensureAdminUser } from '../userInit.js'

describe('ensureAdminUser', () => {
  let db: LibSQLDatabase

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await migrateDatabase(db)
  })

  it('is a no-op — does not create any users (setup wizard handles first-run)', async () => {
    await ensureAdminUser(db)
    const allUsers = await db.select().from(users)
    expect(allUsers).toHaveLength(0)
  })

  it('does not throw when called multiple times', async () => {
    await expect(ensureAdminUser(db)).resolves.toBeUndefined()
    await expect(ensureAdminUser(db)).resolves.toBeUndefined()
    const allUsers = await db.select().from(users)
    expect(allUsers).toHaveLength(0)
  })
})
