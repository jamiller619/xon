import type { LibSQLDatabase } from 'drizzle-orm/libsql'

/**
 * Previously auto-created a default admin account on first boot.
 * Now a no-op: the onboarding wizard (POST /api/v1/auth/setup) handles
 * first-time admin account creation.
 */
// biome-ignore lint/suspicious/noExplicitAny: kept for interface compatibility
export async function ensureAdminUser(_db: LibSQLDatabase<any>): Promise<void> {
  // No-op: setup wizard handles first-run admin creation
}
