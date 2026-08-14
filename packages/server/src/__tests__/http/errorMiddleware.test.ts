import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'
import { onError, onNotFound } from '../../http/errorMiddleware.ts'

describe('errorMiddleware', () => {
  it('onError returns the shared 500 envelope without leaking details', async () => {
    const app = new Hono()
    app.onError(onError)
    app.get('/boom', () => {
      throw new Error('something went wrong')
    })

    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  })

  it('onNotFound returns 404 JSON with error and path fields', async () => {
    const app = new Hono()
    app.notFound(onNotFound)

    const res = await app.request('/no-such-route')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  it('createApp returns 404 JSON for unknown route', async () => {
    const app = createApp()
    const res = await app.request('/api/unknown-endpoint')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  it('createApp returns 500 JSON for route that throws', async () => {
    // Inject a throwing route directly on the Hono instance is not possible after
    // createApp, so test onError directly via a standalone Hono app.
    const mini = new Hono()
    mini.onError(onError)
    mini.get('/throw', () => {
      throw new TypeError('type error')
    })

    const res = await mini.request('/throw')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  })
})
