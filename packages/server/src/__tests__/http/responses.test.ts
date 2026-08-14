import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  cachedJson,
  errorCodes,
  errorResponse,
  noContent,
  setPaginationHeaders,
} from '../../http/responses.ts'

describe('HTTP response contracts', () => {
  it.each([
    [400, errorCodes.badRequest],
    [401, errorCodes.unauthorized],
    [403, errorCodes.forbidden],
    [404, errorCodes.notFound],
    [409, errorCodes.conflict],
    [413, errorCodes.payloadTooLarge],
    [415, errorCodes.unsupportedMediaType],
    [416, errorCodes.badRequest],
    [422, errorCodes.unprocessableEntity],
    [500, errorCodes.internal],
  ] as const)('returns the shared envelope for %i %s', async (status, code) => {
    const app = new Hono().get('/', (c) =>
      errorResponse(c, status, code, 'Contract message'),
    )

    const response = await app.request('/')

    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: { code, message: 'Contract message' },
    })
  })

  it('serializes dates as UTC ISO strings and supports conditional requests', async () => {
    const app = new Hono().get('/', (c) =>
      cachedJson(c, {
        createdAt: new Date('2026-08-14T12:34:56.000Z'),
      }),
    )

    const response = await app.request('/')
    const etag = response.headers.get('ETag')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(etag).toMatch(/^"[a-f0-9]{16}"$/)
    expect(await response.json()).toEqual({
      createdAt: '2026-08-14T12:34:56.000Z',
    })

    const notModified = await app.request('/', {
      headers: { 'If-None-Match': `"other", W/${etag ?? ''}` },
    })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(notModified.headers.get('ETag')).toBe(etag)
    expect(await notModified.text()).toBe('')
  })

  it('sets the shared pagination metadata without changing list bodies', async () => {
    const app = new Hono().get('/', (c) => {
      setPaginationHeaders(c, { page: 2, limit: 20, total: 45 })
      return c.json([])
    })

    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(response.headers.get('X-Total-Count')).toBe('45')
    expect(response.headers.get('X-Page')).toBe('2')
    expect(response.headers.get('X-Page-Size')).toBe('20')
    expect(response.headers.get('X-Total-Pages')).toBe('3')
  })

  it('uses 204 with an empty body for successful deletion', async () => {
    const app = new Hono().delete('/', noContent)
    const response = await app.request('/', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })
})
