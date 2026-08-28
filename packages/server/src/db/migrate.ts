import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { migrateMediaItemTags } from './dataMigrations/mediaItemTags.ts'
import { migrateRelativeMediaPaths } from './dataMigrations/relativeMediaPaths.ts'
import {
  migrateRelativeLocalArtworkPaths,
  migrateRelativeThumbnailPaths,
} from './dataMigrations/relativeThumbnailPaths.ts'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

export async function migrateDatabase(db: LibSQLDatabase): Promise<void> {
  await migrate(db, { migrationsFolder })
  await migrateRelativeThumbnailPaths(db)
  await migrateRelativeLocalArtworkPaths(db)
  await migrateRelativeMediaPaths(db)
  await migrateMediaItemTags(db)
}
