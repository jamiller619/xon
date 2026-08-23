import { and, eq } from 'drizzle-orm'
import type { Context, MiddlewareHandler, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { LibSQLDatabase } from '../db/db.ts'
import { sessions, users } from '../db/schema.ts'
import auth from '../lib/auth.ts'
import { createLogger } from '../logger.ts'
import { sessionClientNameFromHeaders } from '../services/sessionClient.ts'
import {
  captureSessionClientName,
  touchSessionActivity,
} from '../services/sessionService.ts'
import { errorCodes, errorResponse } from './responses.ts'

const logger = createLogger('auth-middleware')

type AuthUser = typeof auth.$Infer.Session.user
type AuthSession = typeof auth.$Infer.Session.session

export type User = Omit<AuthUser, 'id'> & {
  id: number
  publicId: string
}

export type Session = Omit<AuthSession, 'id' | 'userId'> & {
  id: number
  publicId: string
  userId: number
}

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

    if (!db) {
      c.set('user', null)
      c.set('session', null)
      return next()
    }

    const publicUserId = session.user.id
    const publicSessionId = session.session.id
    const internal = await db
      .select({ userId: users.id, sessionId: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(users.publicId, publicUserId),
          eq(sessions.publicId, publicSessionId),
        ),
      )
      .get()

    if (!internal) {
      c.set('user', null)
      c.set('session', null)
      return next()
    }

    const user = {
      ...session.user,
      id: internal.userId,
      publicId: publicUserId,
    }
    const internalSession = {
      ...session.session,
      id: internal.sessionId,
      publicId: publicSessionId,
      userId: internal.userId,
    }

    c.set('user', user)
    c.set('session', internalSession)

    if (db) {
      try {
        await captureSessionClientName(
          db,
          internalSession.id,
          sessionClientNameFromHeaders(c.req.raw.headers),
        )
        await touchSessionActivity(db, internalSession.id)
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
    user: User | null
    session: Session | null
  }
}
