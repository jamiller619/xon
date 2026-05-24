import { describe, expect, it } from 'vitest'
import { app } from '../index.ts'

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok' })
    expect(body).toHaveProperty('timestamp')
  })

  it('returns JSON content-type', async () => {
    const res = await app.request('/api/health')
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('timestamp is a valid ISO string', async () => {
    const res = await app.request('/api/health')
    const body = (await res.json()) as { status: string; timestamp: string }
    expect(() => new Date(body.timestamp)).not.toThrow()
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
  })
})

describe('unknown routes', () => {
  it('returns 401 for unknown paths', async () => {
    const res = await app.request('/api/unknown')
    expect(res.status).toBe(401)
  })
})
