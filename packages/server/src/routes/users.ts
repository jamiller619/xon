import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { requireAuth } from '../http/authMiddleware.js'
import { createNoStoreJSONResponse } from '../http/responses.ts'
import {
  getPlayStateProgress,
  getResumablePlayStates,
} from '../services/userService.ts'

export function makeUsersRouter(db: LibSQLDatabase) {
  const router = new Hono()

    // GET /users/me — get current user profile
    .get('/me', async (c) => {
      const user = c.get('user')

      if (!user) return createNoStoreJSONResponse(c, null)
      const { publicId, ...publicUser } = user
      return createNoStoreJSONResponse(c, { ...publicUser, id: publicId })
    })

    // GET /users/me/play-states — latest resumable playback state for the dashboard.
    .get('/me/play-states', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await getResumablePlayStates(db, user.id)

      return createNoStoreJSONResponse(c, rows)
    })

    // GET /users/me/play-states/progress — compact lookup data for media cards.
    .get('/me/play-states/progress', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await getPlayStateProgress(db, user.id)

      return createNoStoreJSONResponse(c, rows)
    })

  return router
}
