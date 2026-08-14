import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { errorCodes, errorResponse } from '../http/responses.ts'
import { validate } from '../http/validate.ts'

export function makeFsRouter(): Hono {
  const router = new Hono()

    // GET /fs/browse?path=<dir>
    // Returns child directories of <dir>. Defaults to filesystem root.
    //
    // Auth rules (enforced here because auth middleware skips /fs/):
    //   - Before setup (no users): open access — the admin hasn't been created yet.
    //   - After setup: requires an authenticated user.
    .get(
      '/browse',
      validate('query', z.object({ path: z.string().optional() })),
      async (c) => {
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
          return errorResponse(
            c,
            400,
            errorCodes.badRequest,
            'Cannot read directory',
          )
        }
      },
    )

  return router
}
