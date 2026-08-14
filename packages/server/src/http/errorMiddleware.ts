import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createLogger } from '../logger.ts'
import type { ErrorCode } from './responses.ts'
import { errorCodes, errorResponse } from './responses.ts'

const logger = createLogger('error-middleware')

/**
 * Global error handler for unhandled errors thrown inside Hono route handlers.
 * Returns the shared error envelope without exposing internal exception data.
 */
export function onError(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return errorResponse(
      c,
      err.status,
      errorCodeForStatus(err.status),
      err.message,
    )
  }

  logger.error('Unhandled server error:', err)

  return errorResponse(
    c,
    500,
    errorCodes.internal,
    'An unexpected error occurred',
  )
}

function errorCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return errorCodes.unauthorized
    case 403:
      return errorCodes.forbidden
    case 404:
      return errorCodes.notFound
    case 409:
      return errorCodes.conflict
    case 413:
      return errorCodes.payloadTooLarge
    case 415:
      return errorCodes.unsupportedMediaType
    case 422:
      return errorCodes.unprocessableEntity
    default:
      return errorCodes.badRequest
  }
}

/**
 * 404 handler for routes that don't match any registered handler.
 */
export function onNotFound(c: Context) {
  return errorResponse(c, 404, errorCodes.notFound, 'Route not found')
}
