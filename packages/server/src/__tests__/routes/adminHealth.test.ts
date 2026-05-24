import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { openDatabase } from '../../db/db.ts'
import { migrateDatabase } from '../../db/migrate.ts'
import { signAccessToken } from '../../routes/auth.ts'
import { scanRegistry } from '../../scanner/scanRegistry.ts'

const AUTH = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    statfs: vi
      .fn()
      .mockResolvedValue({ bsize: 4096, blocks: 10000, bfree: 4000 }),
  }
})

describe('Admin Health API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)
    scanRegistry.clear()
  })

  afterEach(() => {
    client.close()
    scanRegistry.clear()
  })

  it('GET /admin/health — returns 200 with required fields', async () => {
    const res = await app.request('/api/admin/health', {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.uptime).toBe('number')
    expect(body.memory).toHaveProperty('heapUsed')
    expect(body.memory).toHaveProperty('heapTotal')
    expect(body.memory).toHaveProperty('rss')
    expect(body.memory).toHaveProperty('total')
    expect(body.memory).toHaveProperty('free')
    expect(body.cpu).toHaveProperty('loadAvg1m')
    expect(body.cpu).toHaveProperty('loadAvg5m')
    expect(body.cpu).toHaveProperty('loadAvg15m')
    expect(body.storage).toHaveProperty('total')
    expect(body.storage).toHaveProperty('free')
    expect(body.storage).toHaveProperty('used')
    expect(Array.isArray(body.activeScans)).toBe(true)
    expect(Array.isArray(body.libraries)).toBe(true)
  })

  it('GET /admin/health — requires admin auth', async () => {
    const userAuth = `Bearer ${await signAccessToken('user-id', 'user', 'user')}`
    const res = await app.request('/api/admin/health', {
      headers: { Authorization: userAuth },
    })
    expect(res.status).toBe(403)
  })

  it('GET /admin/health — activeScans only includes running scans', async () => {
    scanRegistry.set('lib-1', {
      status: 'running',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      progress: {
        dataSourceId: 'ds-1',
        totalFiles: 100,
        processedFiles: 42,
        currentFile: '/foo.mp4',
      },
      summary: null,
      error: null,
    })
    scanRegistry.set('lib-2', {
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      progress: null,
      summary: {
        libraryId: 'lib-2',
        newItems: 5,
        updatedItems: 0,
        removedItems: 0,
        totalDiscovered: 5,
      },
      error: null,
    })

    const res = await app.request('/api/admin/health', {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activeScans).toHaveLength(1)
    expect(body.activeScans[0].libraryId).toBe('lib-1')
    expect(body.activeScans[0].progress.processedFiles).toBe(42)
  })

  it('GET /admin/health — storage uses statfs values', async () => {
    const res = await app.request('/api/admin/health', {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // bsize=4096, blocks=10000, bfree=4000 → total=40960000, free=16384000
    expect(body.storage.total).toBe(4096 * 10000)
    expect(body.storage.free).toBe(4096 * 4000)
    expect(body.storage.used).toBe(4096 * (10000 - 4000))
  })

  it('GET /admin/health — libraries array is empty when no libraries', async () => {
    const res = await app.request('/api/admin/health', {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.libraries).toHaveLength(0)
  })
})
