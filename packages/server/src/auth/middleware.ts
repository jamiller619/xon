import type { Context, MiddlewareHandler, Next } from 'hono'
import auth from '../lib/auth.ts'

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

/**
 * Requires an authenticated user (set by the session middleware).
 * Responds 401 for unauthenticated requests.
 */
export function requireAuth(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!c.get('user')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  }
}

declare module 'hono' {
  interface ContextVariableMap {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}
