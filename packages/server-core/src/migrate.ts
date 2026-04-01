import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../drizzle',
);

export async function migrateDatabase(db: LibSQLDatabase): Promise<void> {
  await migrate(db, { migrationsFolder });
}
