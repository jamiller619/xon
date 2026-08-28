import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('../../lib/auth.ts', () => ({
  default: {
    api: { getSession },
  },
}))

import { makeSessionMiddleware } from '../../http/authMiddleware.ts'

describe('session middleware cookies', () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it('forwards every Set-Cookie header returned by a session refresh', async () => {
    const authHeaders = new Headers()
    authHeaders.append(
      'Set-Cookie',
      'better-auth.session_token=renewed; Path=/; HttpOnly',
    )
    authHeaders.append(
      'Set-Cookie',
      'better-auth.session_data=cached; Path=/; HttpOnly',
    )
    getSession.mockResolvedValue({
      headers: authHeaders,
      response: {
        session: { id: 'session-public' },
        user: { id: 'user-public' },
      },
    })

    const app = new Hono().basePath('/api')
    app.use('/*', makeSessionMiddleware())
    app.get('/probe', (c) => c.json({ ok: true }))

    const response = await app.request('/api/probe')

    expect(response.status).toBe(200)
    expect(getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      returnHeaders: true,
    })
    expect(response.headers.getSetCookie()).toEqual([
      'better-auth.session_token=renewed; Path=/; HttpOnly',
      'better-auth.session_data=cached; Path=/; HttpOnly',
    ])
  })

  it('leaves Better Auth routes in sole control of their cookies', async () => {
    const app = new Hono().basePath('/api')
    app.use('/*', makeSessionMiddleware())
    app.post('/auth/sign-out', (c) => {
      c.header(
        'Set-Cookie',
        'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly',
      )
      return c.json({ success: true })
    })

    const response = await app.request('/api/auth/sign-out', {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(getSession).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([
      'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly',
    ])
  })
})
