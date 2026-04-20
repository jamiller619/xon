import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireRole } from '../auth/rbac.js'
import { validate } from '../http/validate.js'

export function makeFsRouter(): Hono {
  const router = new Hono()

  // GET /fs/browse?path=<dir>
  // Returns child directories of <dir>. Defaults to filesystem root.
  // Requires manager role — this endpoint exposes the server's filesystem.
  router.get(
    '/browse',
    requireRole('manager'),
    validate('query', z.object({ path: z.string().optional() })),
    async (c) => {
      const rawPath = c.req.valid('query').path ?? '/'
      const resolved = path.resolve(rawPath)

      let entries: { name: string; path: string }[] = []
      try {
        const dirents = await readdir(resolved, { withFileTypes: true })
        const dirs = dirents.filter((d) => d.isDirectory())
        const results = await Promise.all(
          dirs.map(async (d) => {
            const fullPath = path.join(resolved, d.name)
            return { name: d.name, path: fullPath }
          }),
        )
        entries = results.sort((a, b) => a.name.localeCompare(b.name))
      } catch {
        return c.json({ error: 'Cannot read directory' }, 400)
      }

      return c.json({ path: resolved, entries })
    },
  )

  return router
}
