import type { MiddlewareHandler } from 'hono'
import { createLogger } from '../logger.ts'

const logger = createLogger('http')

export function makeLoggingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    const { method } = c.req
    const path = c.req.path
    const status = c.res.status

    logger.log(`${method} ${path} ${status} ${ms}ms`)
  }
}
