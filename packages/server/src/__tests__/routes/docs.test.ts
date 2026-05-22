import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'

describe('GET /api/docs/openapi.json', () => {
  const app = createApp()

  it('returns HTTP 200 without auth', async () => {
    const res = await app.request('/api/docs/openapi.json')
    expect(res.status).toBe(200)
  })

  it('returns a valid OpenAPI 3.1 spec', async () => {
    const res = await app.request('/api/docs/openapi.json')
    const spec = (await res.json()) as Record<string, unknown>
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info).toBeDefined()
    expect(spec.paths).toBeDefined()
    expect(spec.components).toBeDefined()
  })

  it('spec includes security scheme definition', async () => {
    const res = await app.request('/api/docs/openapi.json')
    const spec = (await res.json()) as {
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(spec.components.securitySchemes.BearerAuth).toBeDefined()
  })

  it('spec includes key endpoints', async () => {
    const res = await app.request('/api/docs/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths['/health']).toBeDefined()
    expect(spec.paths['/auth/login']).toBeDefined()
    expect(spec.paths['/libraries']).toBeDefined()
    expect(spec.paths['/search']).toBeDefined()
    expect(spec.paths['/admin/users']).toBeDefined()
  })

  it('content-type is application/json', async () => {
    const res = await app.request('/api/docs/openapi.json')
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('GET /api/docs', () => {
  const app = createApp()

  it('returns HTTP 200 without auth', async () => {
    const res = await app.request('/api/docs')
    expect(res.status).toBe(200)
  })

  it('returns HTML with Swagger UI', async () => {
    const res = await app.request('/api/docs')
    const html = await res.text()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('swagger-ui')
    expect(html).toContain('openapi.json')
  })
})
