import { Hono } from 'hono'
import config from '../config.js'

export function makeConfigRouter(): Hono {
  const router = new Hono()

  router.get('/', async (c) => {
    return c.json(config.getStore())
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    await config.setStore(body)

    return c.json(body)
  })

  return router
}
