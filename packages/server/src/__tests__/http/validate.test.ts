import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validate } from '../../http/validate.ts'

describe('validate', () => {
  it('passes valid JSON body to handler', async () => {
    const app = new Hono()
    const schema = z.object({ name: z.string().min(1) })
    app.post('/test', validate('json', schema), (c) => {
      const body = c.req.valid('json')
      return c.json({ name: body.name })
    })

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Alice' })
  })

  it('returns 400 with consistent error format for invalid JSON body', async () => {
    const app = new Hono()
    const schema = z.object({ name: z.string().min(1), age: z.number().int() })
    app.post('/test', validate('json', schema), (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', age: 'not-a-number' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(Array.isArray(body.details)).toBe(true)
    expect(body.details.length).toBeGreaterThan(0)
  })

  it('returns 400 for missing required fields', async () => {
    const app = new Hono()
    app.post('/test', validate('json', z.object({ id: z.string() })), (c) =>
      c.json({ ok: true }),
    )

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['id'] })]),
    )
  })

  it('validates query params and returns 400 on failure', async () => {
    const app = new Hono()
    const schema = z.object({ q: z.string().min(1) })
    app.get('/search', validate('query', schema), (c) => {
      const { q } = c.req.valid('query')
      return c.json({ q })
    })

    const res = await app.request('/search')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(Array.isArray(body.details)).toBe(true)
  })

  it('passes valid query params to handler', async () => {
    const app = new Hono()
    const schema = z.object({ q: z.string().min(1) })
    app.get('/search', validate('query', schema), (c) => {
      const { q } = c.req.valid('query')
      return c.json({ q })
    })

    const res = await app.request('/search?q=hello')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ q: 'hello' })
  })

  it('details array contains ZodIssue objects with path and message', async () => {
    const app = new Hono()
    app.post(
      '/test',
      validate('json', z.object({ count: z.number().int().min(1) })),
      (c) => c.json({ ok: true }),
    )

    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: -5 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    const issue = body.details[0]
    expect(issue).toHaveProperty('path')
    expect(issue).toHaveProperty('message')
  })
})
