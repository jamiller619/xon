import { and, desc, eq, or } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { mediaItems, mediaPlayStates } from '../db/schema.ts'
import { requireAuth } from '../http/authMiddleware.js'

export function makeUsersRouter(db: LibSQLDatabase) {
  const router = new Hono()

    // GET /users/me — get current user profile
    .get('/me', async (c) => {
      const user = c.get('user')

      return c.json(user)
    })

    // GET /users/me/play-states — latest resumable playback state for the dashboard.
    .get('/me/play-states', requireAuth, async (c) => {
      const user = c.get('user')
      const rows = await db
        .select({
          mediaItemId: mediaPlayStates.mediaItemId,
          position: mediaPlayStates.position,
          duration: mediaPlayStates.duration,
          status: mediaPlayStates.status,
          startedAt: mediaPlayStates.startedAt,
          updatedAt: mediaPlayStates.updatedAt,
          stoppedAt: mediaPlayStates.stoppedAt,
          mediaItem: mediaItems,
        })
        .from(mediaPlayStates)
        .innerJoin(mediaItems, eq(mediaPlayStates.mediaItemId, mediaItems.id))
        .where(
          and(
            eq(mediaPlayStates.userId, user.id),
            or(
              eq(mediaPlayStates.status, 'playing'),
              eq(mediaPlayStates.status, 'stopped'),
            ),
          ),
        )
        .orderBy(desc(mediaPlayStates.updatedAt))
        .limit(50)

      return c.json(rows)
    })

    // GET /users/me/play-states/progress — compact lookup data for media cards.
    .get('/me/play-states/progress', requireAuth, async (c) => {
      const user = c.get('user')

      const rows = await db
        .select({
          mediaItemId: mediaPlayStates.mediaItemId,
          position: mediaPlayStates.position,
          duration: mediaPlayStates.duration,
          status: mediaPlayStates.status,
        })
        .from(mediaPlayStates)
        .where(eq(mediaPlayStates.userId, user.id))

      return c.json(rows)
    })

  return router
}
