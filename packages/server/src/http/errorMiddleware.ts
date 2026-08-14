import type { Context } from 'hono'
import { createLogger } from '../logger.ts'

const logger = createLogger('error-middleware')

/**
 * Global error handler for unhandled errors thrown inside Hono route handlers.
 * Returns a consistent JSON format: { error: string, message?: string }
 */
export function onError(err: Error, c: Context) {
  logger.error('Unhandled server error:', err)

  return c.json({ error: 'Internal server error', message: err.message }, 500)
}

/**
 * 404 handler for routes that don't match any registered handler.
 */
export function onNotFound(c: Context) {
  return c.json({ error: 'Not found', path: c.req.path }, 404)
}
