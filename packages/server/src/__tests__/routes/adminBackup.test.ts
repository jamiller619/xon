import { deflateRawSync } from 'node:zlib'
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.ts'
import { hashPassword } from '../../auth/password.ts'
import { openDatabase } from '../../db/db.ts'
import { migrateDatabase } from '../../db/migrate.ts'
import { users } from '../../db/schema.ts'
import { signAccessToken } from '../../routes/auth.ts'

// Mock fs/promises so tests don't touch the real filesystem
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`
const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'user', 'user')}`

// ─── ZIP helpers used in tests ────────────────────────────────────────────────

function crc32(data: Buffer): number {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildTestZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  const centralEntries: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const compressed = deflateRawSync(file.data)
    const checksum = crc32(file.data)

    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8) // DEFLATE
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    nameBytes.copy(local, 30)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBytes.copy(central, 46)

    parts.push(local, compressed)
    centralEntries.push(central)
    offset += 30 + nameBytes.length + compressed.length
  }

  const cdBuf = Buffer.concat(centralEntries)
  const cdStart = offset
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(cdStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, cdBuf, eocd])
}

function buildValidBackupZip(opts?: { version?: string }): Buffer {
  const version = opts?.version ?? '1'
  const backupInfo = {
    version,
    xonVersion: '0.0.1',
    createdAt: new Date().toISOString(),
  }
  return buildTestZip([
    { name: 'backup-info.json', data: Buffer.from(JSON.stringify(backupInfo)) },
    { name: 'xon.db', data: Buffer.from('SQLite format 3') },
    { name: 'plugins.json', data: Buffer.from('[]') },
    { name: 'server-config.json', data: Buffer.from('{}') },
  ])
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Admin Backup API', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)

    await db.insert(users).values({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await hashPassword('pass'),
      role: 'admin',
    })
    await db.insert(users).values({
      id: 'user-1',
      username: 'regularuser',
      email: 'user@example.com',
      displayName: 'User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
    })
  })

  afterEach(() => {
    client.close()
    vi.clearAllMocks()
  })

  // ─── POST /admin/backup/metadata ───────────────────────────────────────────

  describe('POST /api/admin/backup/metadata', () => {
    it('returns 200 with a ZIP for admin', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('fake-db') as never)

      const res = await app.request('/api/admin/backup/metadata', {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/zip')
      const disposition = res.headers.get('Content-Disposition') ?? ''
      expect(disposition).toContain('xon-backup-')
      expect(disposition).toContain('.zip')
    })

    it('returns 403 for non-admin', async () => {
      const res = await app.request('/api/admin/backup/metadata', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      })
      expect(res.status).toBe(403)
    })

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/admin/backup/metadata', {
        method: 'POST',
      })
      expect(res.status).toBe(401)
    })

    it('ZIP contains backup-info.json with version 1', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('fake-db') as never)

      const res = await app.request('/api/admin/backup/metadata', {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      })

      expect(res.status).toBe(200)
      const arrayBuffer = await res.arrayBuffer()
      const zipBuf = Buffer.from(arrayBuffer)

      // Find and verify backup-info.json is present (EOCD signature at end)
      let eocdPos = -1
      for (let i = zipBuf.length - 22; i >= 0; i--) {
        if (zipBuf.readUInt32LE(i) === 0x06054b50) {
          eocdPos = i
          break
        }
      }
      expect(eocdPos).toBeGreaterThan(0)

      const entries = zipBuf.readUInt16LE(eocdPos + 10)
      expect(entries).toBeGreaterThanOrEqual(3) // backup-info.json, xon.db, plugins.json
    })

    it('produces a valid ZIP even when DB file is missing (in-memory mode)', async () => {
      const { readFile } = await import('node:fs/promises')
      vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT') as never)

      const res = await app.request('/api/admin/backup/metadata', {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/zip')
    })
  })

  // ─── POST /admin/restore/metadata ─────────────────────────────────────────

  describe('POST /api/admin/restore/metadata', () => {
    it('returns 200 and restores DB from valid backup ZIP', async () => {
      const { writeFile } = await import('node:fs/promises')
      vi.mocked(writeFile).mockResolvedValueOnce(undefined as never)

      const zipBuf = buildValidBackupZip()

      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: zipBuf,
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body).toHaveProperty('restoredFrom')
      expect(body).toHaveProperty('xonVersion')
      expect(vi.mocked(writeFile)).toHaveBeenCalledOnce()
    })

    it('returns 400 for an incompatible backup version', async () => {
      const zipBuf = buildValidBackupZip({ version: '99' })

      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: zipBuf,
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Incompatible backup version')
    })

    it('returns 400 when ZIP is missing backup-info.json', async () => {
      const zipBuf = buildTestZip([
        { name: 'xon.db', data: Buffer.from('fake-db') },
      ])

      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: zipBuf,
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('missing backup-info.json')
    })

    it('returns 400 for an invalid (non-ZIP) body', async () => {
      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from('not a zip file'),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Invalid ZIP')
    })

    it('returns 400 for empty body', async () => {
      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.alloc(0),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('No backup data')
    })

    it('returns 403 for non-admin', async () => {
      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
        body: Buffer.alloc(0),
      })
      expect(res.status).toBe(403)
    })

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
      })
      expect(res.status).toBe(401)
    })

    it('skips writeFile when backup xon.db is empty (in-memory scenario)', async () => {
      const { writeFile } = await import('node:fs/promises')
      vi.mocked(writeFile).mockResolvedValue(undefined as never)

      // Build ZIP with empty xon.db
      const backupInfo = {
        version: '1',
        xonVersion: '0.0.1',
        createdAt: new Date().toISOString(),
      }
      const zipBuf = buildTestZip([
        {
          name: 'backup-info.json',
          data: Buffer.from(JSON.stringify(backupInfo)),
        },
        { name: 'xon.db', data: Buffer.alloc(0) },
      ])

      const res = await app.request('/api/admin/restore/metadata', {
        method: 'POST',
        headers: {
          Authorization: ADMIN_AUTH,
          'Content-Type': 'application/octet-stream',
        },
        body: zipBuf,
      })

      expect(res.status).toBe(200)
      // writeFile should NOT be called for empty DB data
      expect(vi.mocked(writeFile)).not.toHaveBeenCalled()
    })
  })
})
