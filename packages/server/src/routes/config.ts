import type { Config } from '@xon/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import config from '../config.ts'
import { noCacheJSON } from '../http/responses.ts'
import { validate } from '../http/validate.ts'

const configUpdateSchema = z.record(z.string(), z.unknown())

export function makeConfigRouter(): Hono {
  const router = new Hono()

    .get('/', async (c) => {
      return noCacheJSON(c, config.getStore())
    })

    .post('/', validate('json', configUpdateSchema), async (c) => {
      const body = c.req.valid('json')
      await config.setStore(body as Partial<Config>)

      return noCacheJSON(c, body)
    })

  return router
}
