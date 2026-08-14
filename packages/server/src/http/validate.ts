import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodSchema } from 'zod'
import { errorCodes, errorResponse } from './responses.ts'

/**
 * Wrapper around @hono/zod-validator that emits the shared API error envelope.
 */
export function validate<
  T extends ZodSchema,
  Target extends keyof ValidationTargets,
>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        errorCodes.validation,
        'Request validation failed',
        result.error.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path.map((segment) =>
            typeof segment === 'symbol'
              ? (segment.description ?? segment.toString())
              : segment,
          ),
        })),
      )
    }
  })
}
