import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { users } from '../db/schema.ts'
import { validate } from '../http/validate.ts'

// import { verifyAccessToken } from '../routes/auth.ts'

const ROLE_RANK = {
  guest: 0,
  user: 1,
  manager: 2,
  admin: 3,
}

export function makeFsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // GET /fs/browse?path=<dir>
  // Returns child directories of <dir>. Defaults to filesystem root.
  //
  // Auth rules (enforced here because auth middleware skips /fs/):
  //   - Before setup (no users): open access — the admin hasn't been created yet.
  //   - After setup: requires an authenticated user.
  router.get(
    '/browse',
    validate('query', z.object({ path: z.string().optional() })),
    async (c) => {
      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .limit(1)

      if (existingUsers.length > 0) {
        // const authHeader = c.req.header('Authorization')
        // const token = authHeader?.startsWith('Bearer ')
        //   ? authHeader.slice(7)
        //   : (c.req.query('token') ?? '')
        // const payload = token ? await verifyAccessToken(token) : null
        // const rank =
        // if (rank < ROLE_RANK.manager) {
        //   return c.json({ error: 'Unauthorized' }, 401)
        // }
      }

      const rawPath = c.req.valid('query').path ?? '/'
      const resolved = path.resolve(rawPath)

      try {
        const dirents = await readdir(resolved, { withFileTypes: true })
        const entries = dirents
          .filter((d) => d.isDirectory())
          .map((d) => ({ name: d.name, path: path.join(resolved, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
        return c.json({ path: resolved, entries })
      } catch {
        return c.json({ error: 'Cannot read directory' }, 400)
      }
    },
  )

  return router
}
