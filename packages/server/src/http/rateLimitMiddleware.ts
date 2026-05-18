import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { Context, Next } from 'hono'

// Per-db rate limit stores so that test instances don't share state
// WeakMap keyed by db instance: "type:ip:windowMinute" → count
const dbStores = new WeakMap<LibSQLDatabase, Map<string, number>>()
const dbCleanupTimes = new WeakMap<LibSQLDatabase, number>()

function getStore(db: LibSQLDatabase): Map<string, number> {
  let store = dbStores.get(db)
  if (!store) {
    store = new Map()
    dbStores.set(db, store)
  }
  return store
}

function pruneStore(db: LibSQLDatabase) {
  const now = Date.now()
  const lastCleanup = dbCleanupTimes.get(db) ?? 0
  if (now - lastCleanup < 60_000) return
  dbCleanupTimes.set(db, now)
  const store = getStore(db)
  const currentWindow = Math.floor(now / 60_000)
  for (const key of store.keys()) {
    const parts = key.split(':')
    const win = parts[parts.length - 1]
    if (win !== undefined && Number(win) < currentWindow) {
      store.delete(key)
    }
  }
}

// async function loadSettings(db: LibSQLDatabase) {
//   const rows = await db
//     .select()
//     .from(serverSettings)
//     .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
//   if (rows.length > 0) return rows[0]
//   // Ensure the default row exists
//   await db
//     .insert(serverSettings)
//     .values({ id: SERVER_SETTINGS_ID })
//     .onConflictDoNothing()
//   const fresh = await db
//     .select()
//     .from(serverSettings)
//     .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
//   return fresh[0] ?? null
// }

export function makeRateLimitMiddleware(
  db: LibSQLDatabase,
  type: 'general' | 'auth',
) {
  return async (c: Context, next: Next) => {
    return next()

    // const rateLimitEnabled = settings?.rateLimitEnabled ?? true
    // const defaultLimit = type === 'auth' ? 10 : 100
    // const limit = settings
    //   ? type === 'auth'
    //     ? settings.rateLimitAuth
    //     : settings.rateLimitGeneral
    //   : defaultLimit

    // if (!rateLimitEnabled) {
    //   return next()
    // }

    // const windowMinute = Math.floor(Date.now() / 60_000)
    // const trustProxy = settings?.trustProxy ?? false
    // const ip = trustProxy
    //   ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    //     c.req.header('x-real-ip') ??
    //     'unknown')
    //   : 'unknown'
    // const key = `${type}:${ip}:${windowMinute}`
    // const resetAt = (windowMinute + 1) * 60

    // pruneStore(db)
    // const store = getStore(db)
    // const current = store.get(key) ?? 0

    // c.header('X-RateLimit-Limit', String(limit))
    // c.header('X-RateLimit-Remaining', String(Math.max(0, limit - current - 1)))
    // c.header('X-RateLimit-Reset', String(resetAt))

    // if (current >= limit) {
    //   c.header('X-RateLimit-Remaining', '0')
    //   return c.json({ error: 'Rate limit exceeded' }, 429)
    // }

    // store.set(key, current + 1)
    // return next()
  }
}
