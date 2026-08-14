import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../../http/authMiddleware.ts'
import { notFound } from '../../http/responses.ts'
import { validate } from '../../http/validate.ts'
import { saveMediaPlayState } from '../../services/mediaPlaybackService.ts'

const playStateSchema = z.object({
  position: z.number().finite().nonnegative(),
  duration: z.number().finite().positive().optional(),
  status: z.enum(['playing', 'stopped', 'completed']),
})

export function makeMediaPlaybackRouter(db: LibSQLDatabase) {
  return new Hono().put(
    '/:id/play-state',
    requireAuth,
    validate('json', playStateSchema),
    async (c) => {
      const state = await saveMediaPlayState(
        db,
        c.get('user').id,
        c.req.param('id'),
        c.req.valid('json'),
      )
      if (!state) return notFound(c, 'Media item not found')
      return c.json(state)
    },
  )
}
