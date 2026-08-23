import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { libraries, users } from '../../db/schema.ts'
import { updateLibraryScanSchedule } from '../../services/libraryService.ts'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

describe('libraryService.updateLibraryScanSchedule', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })

    const [user] = await db
      .insert(users)
      .values({
        publicId: 'schedule-user',
        name: 'Schedule user',
        email: 'schedule@example.com',
      })
      .returning({ id: users.id })
    if (!user) throw new Error('User fixture was not created')
    await db.insert(libraries).values({
      publicId: 'schedule-library',
      ownerId: user.id,
      name: 'Schedule library',
      type: 'Movies',
      dataSources: [],
    })
  })

  afterEach(() => client.close())

  it('sets and clears a schedule while returning the public library', async () => {
    const scheduled = await updateLibraryScanSchedule(
      db,
      'schedule-library',
      '0 */6 * * *',
    )
    expect(scheduled).toMatchObject({
      id: 'schedule-library',
      ownerId: 'schedule-user',
      scanSchedule: '0 */6 * * *',
    })
    expect(scheduled?.updatedAt).toBeInstanceOf(Date)

    const cleared = await updateLibraryScanSchedule(
      db,
      'schedule-library',
      null,
    )
    expect(cleared?.scanSchedule).toBeNull()
  })

  it('does not update a missing library', async () => {
    expect(
      await updateLibraryScanSchedule(db, 'missing-library', '*/5 * * * *'),
    ).toBeUndefined()
  })
})
