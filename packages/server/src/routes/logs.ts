import { Hono } from 'hono'

export function makeLogsRouter(): Hono {
  const router = new Hono()

  router.get('/', async (c) => {})

  return router
}
