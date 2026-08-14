import type { Context, MiddlewareHandler, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import auth from '../lib/auth.ts'
import { errorCodes, errorResponse } from './responses.ts'

type User = typeof auth.$Infer.Session.user
type Session = typeof auth.$Infer.Session.session

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
export const requireAuth = createMiddleware<{
  Variables: {
    user: User
    session: Session
  }
}>(async (c, next) => {
  const user = c.get('user')
  const session = c.get('session')

  if (!user || !session) {
    return errorResponse(
      c,
      401,
      errorCodes.unauthorized,
      'Authentication required',
    )
  }

  // Re-setting them connects the runtime check with the middleware's
  // non-null output type.
  c.set('user', user)
  c.set('session', session)

  await next()
})

declare module 'hono' {
  interface ContextVariableMap {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}
