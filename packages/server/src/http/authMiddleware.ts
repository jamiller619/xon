import type { Context, MiddlewareHandler, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { LibSQLDatabase } from '../db/db.ts'
import auth from '../lib/auth.ts'
import { createLogger } from '../logger.ts'
import { sessionClientNameFromHeaders } from '../services/sessionClient.ts'
import {
  captureSessionClientName,
  touchSessionActivity,
} from '../services/sessionService.ts'
import { errorCodes, errorResponse } from './responses.ts'

const logger = createLogger('auth-middleware')

type User = typeof auth.$Infer.Session.user
type Session = typeof auth.$Infer.Session.session

export type AuthenticatedEnv = {
  Variables: {
    user: User
    session: Session
  }
}

export function makeSessionMiddleware(db?: LibSQLDatabase): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (!session) {
      c.set('user', null)
      c.set('session', null)

      return next()
    }

    c.set('user', session.user)
    c.set('session', session.session)

    if (db) {
      try {
        await captureSessionClientName(
          db,
          session.session.id,
          sessionClientNameFromHeaders(c.req.raw.headers),
        )
        await touchSessionActivity(db, session.session.id)
      } catch (error) {
        logger.warn('Could not update session activity', error)
      }
    }

    return next()
  }
}

/**
 * Requires an authenticated user (set by the session middleware).
 * Responds 401 for unauthenticated requests.
 */
export const requireAuth = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
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
  },
)

declare module 'hono' {
  interface ContextVariableMap {
    user: typeof auth.$Infer.Session.user | null
    session: typeof auth.$Infer.Session.session | null
  }
}
