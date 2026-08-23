import { and, desc, eq, or } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { publicMediaColumns } from '../db/publicSelections.ts'
import { libraries, mediaItems, mediaPlayStates } from '../db/schema.ts'
import { requireAuth } from '../http/authMiddleware.js'
import { createNoStoreJSONResponse } from '../http/responses.ts'

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
      const rows = await db
        .select({
          mediaItemId: mediaItems.publicId,
          position: mediaPlayStates.position,
          duration: mediaPlayStates.duration,
          status: mediaPlayStates.status,
          startedAt: mediaPlayStates.startedAt,
          updatedAt: mediaPlayStates.updatedAt,
          stoppedAt: mediaPlayStates.stoppedAt,
          mediaItem: {
            ...publicMediaColumns,
            libraryId: libraries.publicId,
          },
        })
        .from(mediaPlayStates)
        .innerJoin(mediaItems, eq(mediaPlayStates.mediaItemId, mediaItems.id))
        .innerJoin(libraries, eq(mediaItems.libraryId, libraries.id))
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

      return createNoStoreJSONResponse(c, rows)
    })

    // GET /users/me/play-states/progress — compact lookup data for media cards.
    .get('/me/play-states/progress', requireAuth, async (c) => {
      const user = c.get('user')

      const rows = await db
        .select({
          mediaItemId: mediaItems.publicId,
          position: mediaPlayStates.position,
          duration: mediaPlayStates.duration,
          status: mediaPlayStates.status,
        })
        .from(mediaPlayStates)
        .innerJoin(mediaItems, eq(mediaPlayStates.mediaItemId, mediaItems.id))
        .where(eq(mediaPlayStates.userId, user.id))

      return createNoStoreJSONResponse(c, rows)
    })

  return router
}
