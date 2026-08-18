import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { computeETag } from '../cache.ts'

export const errorCodes = {
  badRequest: 'BAD_REQUEST',
  conflict: 'CONFLICT',
  currentSession: 'current_session',
  forbidden: 'FORBIDDEN',
  internal: 'INTERNAL_ERROR',
  notFound: 'NOT_FOUND',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  unauthorized: 'UNAUTHORIZED',
  unsupportedMediaType: 'UNSUPPORTED_MEDIA_TYPE',
  unprocessableEntity: 'UNPROCESSABLE_ENTITY',
  validation: 'VALIDATION_ERROR',
} as const

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes]

export interface ValidationErrorDetail {
  code: string
  message: string
  path: Array<string | number>
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode
    message: string
    details?: ValidationErrorDetail[]
  }
}

export function errorResponse<const Status extends ContentfulStatusCode>(
  c: Context,
  status: Status,
  code: ErrorCode,
  message: string,
  details?: ValidationErrorDetail[],
) {
  c.header('Cache-Control', 'no-store')
  const error =
    details === undefined ? { code, message } : { code, message, details }
  return c.json({ error } satisfies ErrorEnvelope, status)
}

export function notFound(c: Context, message = 'Resource not found') {
  return errorResponse(c, 404, errorCodes.notFound, message)
}

export function noContent(c: Context) {
  return c.body(null, 204)
}

export interface PaginationMetadata {
  page: number
  limit: number
  total: number
}

export function setPaginationHeaders(
  c: Context,
  { page, limit, total }: PaginationMetadata,
) {
  c.header('X-Total-Count', String(total))
  c.header('X-Page', String(page))
  c.header('X-Page-Size', String(limit))
  c.header('X-Total-Pages', String(Math.ceil(total / limit)))
}

interface CachedJsonOptions {
  cacheControl?: string
  etagSource?: unknown
}

export function cachedJson<T>(
  c: Context,
  data: T,
  options: CachedJsonOptions = {},
) {
  const etag = computeETag(options.etagSource ?? data)
  if (
    setConditionalCacheHeaders(
      c,
      etag,
      options.cacheControl ?? 'private, no-cache',
    )
  )
    return c.body(null, 304)

  return c.json(data)
}

export function setConditionalCacheHeaders(
  c: Context,
  etag: string,
  cacheControl: string,
): boolean {
  c.header('Cache-Control', cacheControl)
  c.header('ETag', etag)
  const candidates = c.req.header('If-None-Match')
  if (!candidates) return false

  const normalizedETag = etag.replace(/^W\//, '')
  return candidates
    .split(',')
    .map((candidate) => candidate.trim())
    .some(
      (candidate) =>
        candidate === '*' || candidate.replace(/^W\//, '') === normalizedETag,
    )
}

export function noCacheJSON<T>(c: Context, data: T) {
  c.header('Cache-Control', 'no-store')
  return c.json(data)
}
