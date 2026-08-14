import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { noCacheJSON } from '../http/responses.ts'
import auth from '../lib/auth.ts'
import * as libraryService from '../services/libraryService.ts'
import * as userService from '../services/userService.ts'

export function makeAuthRouter(db: LibSQLDatabase) {
  const router = new Hono({
    strict: false,
  })

    // GET /setup-status — unauthenticated, returns whether first-time setup is needed
    .get('/setup-status', async (c) => {
      const users = await userService.getUsers(db)
      const libraries = await libraryService.getAllLibraries(db)

      return noCacheJSON(c, {
        users: users.length > 0,
        libraries: libraries.length > 0,
      })
    })

    // Auth middleware
    .on(['POST', 'GET'], '*', (c) => auth.handler(c.req.raw))

  return router
}
