import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { requireAuth } from '../http/authMiddleware.ts'
import {
  createNoStoreJSONResponse,
  errorCodes,
  errorResponse,
  noContent,
  notFound,
} from '../http/responses.ts'
import { resourceIdParamsSchema } from '../http/schemas.ts'
import { validate } from '../http/validate.ts'
import {
  listActiveSessions,
  revokeOwnedSession,
} from '../services/sessionService.ts'

export function makeSessionsRouter(db: LibSQLDatabase) {
  return new Hono()
    .get('/', requireAuth, async (c) => {
      const user = c.get('user')
      const session = c.get('session')
      const activeSessions = await listActiveSessions(db, user.id, session.id)

      return createNoStoreJSONResponse(c, activeSessions)
    })
    .delete(
      '/:id',
      requireAuth,
      validate('param', resourceIdParamsSchema),
      async (c) => {
        const id = c.req.valid('param').id
        const user = c.get('user')
        const session = c.get('session')

        if (id === session.publicId) {
          return errorResponse(
            c,
            409,
            errorCodes.currentSession,
            'The current session cannot be revoked here',
          )
        }

        if (!(await revokeOwnedSession(db, user.id, id))) {
          return notFound(c, 'Session not found')
        }

        return noContent(c)
      },
    )
}

export type SessionsRoutes = ReturnType<typeof makeSessionsRouter>
