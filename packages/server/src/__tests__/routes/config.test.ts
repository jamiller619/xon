import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '@xon/shared'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigStore from '../../config/ConfigStore.ts'
import { makeConfigRouter } from '../../routes/config.ts'

vi.mock('../../lib/auth.ts', () => ({ default: {} }))

const TEST_CONFIG = {
  'app.locale': 'en-US',
  'log.level': 'info',
  'log.retentionDays': 7,
  'appdata.path': '/tmp/xon',
  'appdata.dbPath': '/tmp/xon/database',
  'appdata.cachePath': '/tmp/xon/cache',
  'appdata.cacheQuota': 0,
  'appdata.logsPath': '/tmp/xon/logs',
  'appdata.pluginsPath': '/tmp/xon/plugins',
  'network.httpPort': 6019,
  'network.httpsPort': 6020,
  'network.sslPath': '/tmp/xon/certificates',
  'network.remoteEnabled': true,
  'network.security.corsEnabled': true,
  'network.security.corsAllowedOrigins': ['http://localhost:6019'],
  'session.ttlDays': 7,
  'session.updateAge': 1,
  'session.disableSessionRefresh': false,
  'session.enableAnonymousLogins': true,
} satisfies Config

describe('Config API', () => {
  let directory: string
  let filePath: string
  let store: ConfigStore
  let app: Hono

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xon-config-test-'))
    filePath = join(directory, 'config.json')
    store = new ConfigStore(filePath, {
      ...TEST_CONFIG,
      'plugins.example.apiKey': 'secret',
    } as Config)

    app = new Hono()
    app.use('*', async (c, next) => {
      if (c.req.header('Authorization') === 'Bearer authenticated') {
        c.set('user', { id: 'user-1' } as never)
        c.set('session', { id: 'session-1' } as never)
      }
      await next()
    })
    app.route('/config', makeConfigRouter(store))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('exposes only the anonymous-login flag through the public bootstrap', async () => {
    const response = await app.request('/config/bootstrap')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      'session.enableAnonymousLogins': true,
    })
  })

  it('requires authentication for the full config', async () => {
    const response = await app.request('/config')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    })
  })

  it('returns only core config keys to an authenticated user', async () => {
    const response = await authenticatedRequest('/config')
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body['network.httpPort']).toBe(6019)
    expect(body['plugins.example.apiKey']).toBeUndefined()
  })

  it('requires authentication for config mutations', async () => {
    const response = await app.request('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'set',
        key: 'network.httpPort',
        value: 7000,
      }),
    })

    expect(response.status).toBe(401)
    expect(store.get('network.httpPort')).toBe(6019)
  })

  it('validates and persists a single namespaced key', async () => {
    const response = await authenticatedRequest('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'set',
        key: 'network.httpPort',
        value: 7000,
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      key: 'network.httpPort',
      value: 7000,
    })

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as Record<
      string,
      unknown
    >
    expect(persisted['network.httpPort']).toBe(7000)
    expect(persisted['plugins.example.apiKey']).toBe('secret')
    expect(persisted.key).toBeUndefined()
    expect(persisted.value).toBeUndefined()
  })

  it('rejects invalid, unknown, and read-only writes without changing data', async () => {
    const invalid = await setConfig('network.httpPort', 70000)
    const unknown = await setConfig('network.unknown', true)
    const readOnly = await setConfig('app.locale', 'fr-FR')

    expect(invalid.status).toBe(400)
    expect(unknown.status).toBe(400)
    expect(readOnly.status).toBe(400)
    expect(store.get('network.httpPort')).toBe(6019)
    expect(store.get('app.locale')).toBe('en-US')
  })

  it('unsets optional keys and rejects required unsets', async () => {
    const optional = await authenticatedRequest('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'unset',
        key: 'network.sslPath',
      }),
    })
    const required = await authenticatedRequest('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'unset',
        key: 'network.httpPort',
      }),
    })

    expect(optional.status).toBe(200)
    expect(await optional.json()).toEqual({ key: 'network.sslPath' })
    expect(store.get('network.sslPath')).toBeUndefined()
    expect(required.status).toBe(400)
    expect(store.get('network.httpPort')).toBe(6019)
  })

  it('serializes concurrent writes without losing unrelated keys', async () => {
    const [port, retention] = await Promise.all([
      setConfig('network.httpPort', 7001),
      setConfig('log.retentionDays', 30),
    ])

    expect(port.status).toBe(200)
    expect(retention.status).toBe(200)

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as Record<
      string,
      unknown
    >
    expect(persisted['network.httpPort']).toBe(7001)
    expect(persisted['log.retentionDays']).toBe(30)
    expect(persisted['plugins.example.apiKey']).toBe('secret')
  })

  function authenticatedRequest(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', 'Bearer authenticated')
    return app.request(path, { ...init, headers })
  }

  function setConfig(key: string, value: unknown) {
    return authenticatedRequest('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'set', key, value }),
    })
  }
})
