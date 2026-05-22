// import { eq, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { Context, MiddlewareHandler, Next } from 'hono'
// import { deleteCookie, getCookie } from 'hono/cookie'
import auth from '../lib/auth.ts'
// import { verifyAccessToken } from '../routes/auth.ts'
// import { hashApiToken } from '../routes/users.ts'
// import { resolveSession, SESSION_COOKIE } from './session.ts'

// const SETUP_USER: AuthUser = { id: 'setup', username: 'setup', role: 'admin' }

// export interface AuthUser {
//   id: string
//   username: string
//   role: string
// }

export function makeSessionMiddleware(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (!session) {
      c.set('user', null)
      c.set('session', null)

      return next()
    }

    c.set('user', session.user)
    c.set('session', session.session)

    return next()
  }
}

declare module 'hono' {
  interface ContextVariableMap {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}

/**
 * JWT auth middleware for all /api/* routes except /api/auth/*.
 * Also accepts API tokens (xon_<hex>) in the Authorization Bearer header.
 * Responds 401 if the token is missing or invalid.
 */
// export function makeAuthMiddleware(db?: LibSQLDatabase) {
//   return async function authMiddleware(c: Context, next: Next) {
//     const path = c.req.path
//     // Skip auth, health, docs, and fs endpoints.
//     // /fs enforces its own auth when setup is complete.
//     if (
//       path.startsWith('/api/auth/') ||
//       path.startsWith('/api/fs/') ||
//       path === '/api/health' ||
//       path === '/api/docs' ||
//       path.startsWith('/api/docs/')
//     ) {
//       return next()
//     }

//     // Before any users exist (setup mode), grant open admin access
//     // if (db) {
//     //   const [row] = await db
//     //     .select({ count: sql<number>`count(*)` })
//     //     .from(users)
//     //   if ((row?.count ?? 0) === 0) {
//     //     // c.set('user', SETUP_USER)
//     //     return next()
//     //   }
//     // }

//     // Try session cookie first
//     if (db) {
//       const sid = getCookie(c, SESSION_COOKIE)
//       if (sid) {
//         const sessionUser = await resolveSession(db, sid)
//         if (sessionUser) {
//           c.set('user', sessionUser)
//           return next()
//         }
//       }
//     }

//     const authHeader = c.req.header('Authorization')
//     // Fall back to ?token= query param for browser-native requests (e.g. <video src>, <track src>)
//     // that cannot send custom headers.
//     const token = authHeader?.startsWith('Bearer ')
//       ? authHeader.slice(7)
//       : (c.req.query('token') ?? '')

//     if (!token) {
//       return c.json({ error: 'Unauthorized' }, 401)
//     }

//     // Try JWT
//     // const payload = await verifyAccessToken(token)
//     // if (payload) {
//     //   c.set('user', {
//     //     id: payload.sub,
//     //     username: payload.username,
//     //     role: payload.role,
//     //   })
//     //   return next()
//     // }

//     // Try API token (xon_ prefix or raw hash lookup)
//     //  if (db && token.startsWith('xon_')) {
//     //     const tokenHash = hashApiToken(token)
//     //     const rows = await db
//     //       .select({
//     //         id: apiTokens.id,
//     //         userId: apiTokens.userId,
//     //         expiresAt: apiTokens.expiresAt,
//     //       })
//     //       . from(apiTokens)
//     //       .where(eq(apiTokens.tokenHash, tokenHash))
//     //       .limit(1)

//     //     const apiToken = rows[0]
//     //     if (apiToken) {
//     //       // Check expiry
//     //       if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
//     //         return c.json({ error: 'Unauthorized' }, 401)
//     //       }

//     //       // Load user details
//     //       const userRows = await db
//     //         .select({ id: users.id, username: users.username, role: users.role })
//     //         .from(users)
//     //         .where(eq(users.id, apiToken.userId))
//     //         .limit(1)

//     //       const user = userRows[0]
//     //       if (user) {
//     //         // Update lastUsedAt asynchronously (don't block the request)
//     //         db.update(apiTokens)
//     //           .set({ lastUsedAt: new Date() })
//     //           .where(eq(apiTokens.id, apiToken.id))
//     //           .catch(() => {})

//     //         c.set('user', {
//     //           id: user.id,
//     //           username: user.username,
//     //           role: user.role,
//     //         })
//     //         return next()
//     //       }
//     //     }
//     //   }

//     return c.json({ error: 'Unauthorized' }, 401)
//   }
// }

/**
 * Default auth middleware (no DB — JWT only). Kept for backward compatibility with tests.
 */
// export async function authMiddleware(c: Context, next: Next) {
//   return makeAuthMiddleware()(c, next)
// }
