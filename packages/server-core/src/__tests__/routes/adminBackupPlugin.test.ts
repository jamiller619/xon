import { copyFile, mkdir, stat, unlink } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import type {
  BackupTargetConfigSchema,
  BackupVerifyResult,
  PluginContext,
  PluginManifest,
} from '@xon/plugin-sdk'
import { BackupTargetPlugin } from '@xon/plugin-sdk'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.js'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import {
  backupFileState,
  backupJobs,
  backupTargets,
  backupVerifyJobs,
  dataSources,
  libraries,
  mediaItems,
} from '../../db/schema.js'
import {
  _resetBackupTargetPluginRegistry,
  registerBackupTargetPlugin,
} from '../../plugins/backupTargetPluginRegistry.js'
import { runMediaBackupJob } from '../../routes/adminBackupMedia.js'
import { runBackupToTarget } from '../../routes/adminBackupTargets.js'
import { runVerifyJob } from '../../routes/adminBackupVerify.js'
import { signAccessToken } from '../../routes/auth.js'

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  readFile: vi.fn(),
}))

const AUTH = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`

// ---------------------------------------------------------------------------
// Test plugin implementation
// ---------------------------------------------------------------------------

class MockBackupPlugin extends BackupTargetPlugin {
  readonly manifest: PluginManifest = {
    id: 'mock-cloud',
    name: 'Mock Cloud Backup',
    version: '1.0.0',
    description: 'Test',
    author: 'Test',
    category: 'BackupTarget',
  }

  readonly configSchema: BackupTargetConfigSchema = {
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'string', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'region', label: 'Region', type: 'string', default: 'us-east-1' },
    ],
  }

  uploadCalls: { localPath: string; remotePath: string }[] = []
  downloadCalls: { remotePath: string; localPath: string }[] = []
  deleteCalls: string[] = []
  verifyCalls: string[] = []
  verifyResult: BackupVerifyResult = { exists: true, checksum: 'abc123' }

  async upload(localPath: string, remotePath: string): Promise<void> {
    this.uploadCalls.push({ localPath, remotePath })
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.downloadCalls.push({ remotePath, localPath })
  }

  async delete(remotePath: string): Promise<void> {
    this.deleteCalls.push(remotePath)
  }

  async list(): Promise<string[]> {
    return this.uploadCalls.map((c) => c.remotePath)
  }

  async verify(remotePath: string): Promise<BackupVerifyResult> {
    this.verifyCalls.push(remotePath)
    return this.verifyResult
  }

  override async init(_context: PluginContext): Promise<void> {}
}

// ---------------------------------------------------------------------------
// runBackupToTarget with plugin type
// ---------------------------------------------------------------------------

describe('runBackupToTarget — plugin type', () => {
  let plugin: MockBackupPlugin

  beforeEach(() => {
    plugin = new MockBackupPlugin()
    _resetBackupTargetPluginRegistry()
    registerBackupTargetPlugin('mock-cloud', plugin)
  })

  afterEach(() => {
    _resetBackupTargetPluginRegistry()
  })

  it('calls plugin.upload for each file', async () => {
    const result = await runBackupToTarget(
      { type: 'plugin', config: '{"pluginId":"mock-cloud"}' },
      ['/media/a.mkv', '/media/b.mkv'],
      '/media',
    )
    expect(result.copied).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(plugin.uploadCalls).toHaveLength(2)
    expect(plugin.uploadCalls[0]).toEqual({
      localPath: '/media/a.mkv',
      remotePath: 'a.mkv',
    })
    expect(plugin.uploadCalls[1]).toEqual({
      localPath: '/media/b.mkv',
      remotePath: 'b.mkv',
    })
  })

  it('records errors without throwing when upload fails', async () => {
    plugin.upload = async () => {
      throw new Error('Network error')
    }
    const result = await runBackupToTarget(
      { type: 'plugin', config: '{"pluginId":"mock-cloud"}' },
      ['/media/a.mkv'],
      '/media',
    )
    expect(result.copied).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Network error')
  })

  it('returns error when plugin is not registered', async () => {
    _resetBackupTargetPluginRegistry()
    const result = await runBackupToTarget(
      { type: 'plugin', config: '{"pluginId":"missing-plugin"}' },
      ['/media/a.mkv'],
      '/media',
    )
    expect(result.copied).toBe(0)
    expect(result.errors[0]).toContain('not registered')
  })

  it('returns error when pluginId is missing from config', async () => {
    const result = await runBackupToTarget(
      { type: 'plugin', config: '{}' },
      ['/media/a.mkv'],
      '/media',
    )
    expect(result.copied).toBe(0)
    expect(result.errors[0]).toContain('missing pluginId')
  })
})

// ---------------------------------------------------------------------------
// Plugin target type via API
// ---------------------------------------------------------------------------

describe('Backup Targets API — plugin type', () => {
  let client: Client
  let db: LibSQLDatabase
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    app = createApp(db)
    vi.clearAllMocks()
  })

  afterEach(() => {
    client.close()
  })

  it('POST /admin/backup/targets — creates a plugin target', async () => {
    const res = await app.request('/api/v1/admin/backup/targets', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cloud Backup',
        type: 'plugin',
        config: { pluginId: 'mock-cloud', bucket: 'my-bucket' },
        enabled: true,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.type).toBe('plugin')
    expect(JSON.parse(body.config)).toMatchObject({ pluginId: 'mock-cloud' })
  })

  it('PUT /admin/backup/targets/:id — updates type to plugin', async () => {
    const id = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id,
      name: 'Local Target',
      type: 'local',
      config: '{"destPath":"/backup"}',
      enabled: true,
      createdAt: new Date(),
    })

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'plugin',
        config: { pluginId: 's3-backup', bucket: 'my-bucket' },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.type).toBe('plugin')
  })
})

// ---------------------------------------------------------------------------
// runMediaBackupJob with plugin type
// ---------------------------------------------------------------------------

describe('runMediaBackupJob — plugin type', () => {
  let client: Client
  let db: LibSQLDatabase
  let plugin: MockBackupPlugin

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    plugin = new MockBackupPlugin()
    _resetBackupTargetPluginRegistry()
    registerBackupTargetPlugin('mock-cloud', plugin)
    vi.clearAllMocks()
    vi.mocked(stat).mockResolvedValue({ size: 1024, mtimeMs: 1000 } as never)
  })

  afterEach(() => {
    client.close()
    _resetBackupTargetPluginRegistry()
  })

  it('calls plugin.upload for each media item', async () => {
    // Insert library + data source + media items
    const [lib] = await db
      .insert(libraries)
      .values({
        id: 'lib1',
        name: 'Movies',
        allowedMediaTypes: '[]',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
    await db.insert(dataSources).values({
      id: 'ds1',
      libraryId: 'lib1',
      type: 'local',
      path: '/media',
      recursive: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.insert(mediaItems).values({
      id: 'item1',
      libraryId: 'lib1',
      dataSourceId: 'ds1',
      filePath: '/media/movie.mkv',
      fileName: 'movie.mkv',
      fileSize: 1024,
      mimeType: 'video/x-matroska',
      mediaCategory: 'Movies',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Insert plugin target
    const targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Cloud',
      type: 'plugin',
      config: '{"pluginId":"mock-cloud"}',
      enabled: true,
      createdAt: new Date(),
    })

    // Insert job
    const jobId = crypto.randomUUID()
    await db.insert(backupJobs).values({
      id: jobId,
      targetId,
      scope: '{}',
      status: 'pending',
      totalFiles: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      errors: '[]',
      createdAt: new Date(),
    })

    await runMediaBackupJob(db, jobId)
    await new Promise((r) => setTimeout(r, 50))

    expect(plugin.uploadCalls).toHaveLength(1)
    expect(plugin.uploadCalls[0]).toEqual({
      localPath: '/media/movie.mkv',
      remotePath: 'media/movie.mkv',
    })

    const jobs = await db.select().from(backupJobs)
    expect(jobs[0]?.status).toBe('completed')
    expect(jobs[0]?.copiedFiles).toBe(1)
    expect(lib).toBeDefined()
  })

  it('calls plugin.delete when removeDeleted is true and file is stale', async () => {
    // Insert library (no media items - simulates all deleted)
    await db.insert(libraries).values({
      id: 'lib1',
      name: 'Movies',
      allowedMediaTypes: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Insert plugin target with removeDeleted
    const targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Cloud',
      type: 'plugin',
      config: '{"pluginId":"mock-cloud"}',
      enabled: true,
      removeDeleted: true,
      createdAt: new Date(),
    })

    // Insert stale file state (no corresponding media item)
    await db.insert(backupFileState).values({
      id: crypto.randomUUID(),
      targetId,
      filePath: '/media/deleted.mkv',
      fileSize: 100,
      mtime: 1000,
      backedUpAt: new Date(),
    })

    // Insert job
    const jobId = crypto.randomUUID()
    await db.insert(backupJobs).values({
      id: jobId,
      targetId,
      scope: '{}',
      status: 'pending',
      totalFiles: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      errors: '[]',
      createdAt: new Date(),
    })

    await runMediaBackupJob(db, jobId)

    expect(plugin.deleteCalls).toHaveLength(1)
    expect(plugin.deleteCalls[0]).toBe('media/deleted.mkv')
  })
})

// ---------------------------------------------------------------------------
// runVerifyJob with plugin type
// ---------------------------------------------------------------------------

describe('runVerifyJob — plugin type', () => {
  let client: Client
  let db: LibSQLDatabase
  let plugin: MockBackupPlugin

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
    plugin = new MockBackupPlugin()
    _resetBackupTargetPluginRegistry()
    registerBackupTargetPlugin('mock-cloud', plugin)
    vi.clearAllMocks()
  })

  afterEach(() => {
    client.close()
    _resetBackupTargetPluginRegistry()
  })

  it('calls plugin.verify and marks file as passed when exists', async () => {
    plugin.verifyResult = { exists: true, checksum: 'sha256-checksum' }

    const targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Cloud',
      type: 'plugin',
      config: '{"pluginId":"mock-cloud"}',
      enabled: true,
      createdAt: new Date(),
    })

    // Insert file state
    const stateId = crypto.randomUUID()
    await db.insert(backupFileState).values({
      id: stateId,
      targetId,
      filePath: '/media/file.mkv',
      fileSize: 1024,
      mtime: 1000,
      backedUpAt: new Date(),
    })

    const jobId = crypto.randomUUID()
    await db.insert(backupVerifyJobs).values({
      id: jobId,
      targetId,
      status: 'pending',
      totalFiles: 0,
      passedFiles: 0,
      failedFiles: 0,
      missingFiles: 0,
      failedItems: '[]',
      createdAt: new Date(),
    })

    await runVerifyJob(db, jobId)

    expect(plugin.verifyCalls).toHaveLength(1)
    expect(plugin.verifyCalls[0]).toBe('media/file.mkv')

    const jobs = await db.select().from(backupVerifyJobs)
    expect(jobs[0]?.passedFiles).toBe(1)
    expect(jobs[0]?.missingFiles).toBe(0)
    expect(jobs[0]?.status).toBe('completed')
  })

  it('marks file as missing when plugin.verify returns exists=false', async () => {
    plugin.verifyResult = { exists: false }

    const targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Cloud',
      type: 'plugin',
      config: '{"pluginId":"mock-cloud"}',
      enabled: true,
      createdAt: new Date(),
    })

    const stateId = crypto.randomUUID()
    await db.insert(backupFileState).values({
      id: stateId,
      targetId,
      filePath: '/media/missing.mkv',
      fileSize: 512,
      mtime: 500,
      backedUpAt: new Date(),
    })

    const jobId = crypto.randomUUID()
    await db.insert(backupVerifyJobs).values({
      id: jobId,
      targetId,
      status: 'pending',
      totalFiles: 0,
      passedFiles: 0,
      failedFiles: 0,
      missingFiles: 0,
      failedItems: '[]',
      createdAt: new Date(),
    })

    await runVerifyJob(db, jobId)

    const jobs = await db.select().from(backupVerifyJobs)
    expect(jobs[0]?.missingFiles).toBe(1)
    expect(jobs[0]?.passedFiles).toBe(0)
  })

  it('marks file as missing when plugin is not registered', async () => {
    _resetBackupTargetPluginRegistry() // remove the plugin

    const targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Cloud',
      type: 'plugin',
      config: '{"pluginId":"unregistered-plugin"}',
      enabled: true,
      createdAt: new Date(),
    })

    await db.insert(backupFileState).values({
      id: crypto.randomUUID(),
      targetId,
      filePath: '/media/file.mkv',
      fileSize: 100,
      mtime: 1000,
      backedUpAt: new Date(),
    })

    const jobId = crypto.randomUUID()
    await db.insert(backupVerifyJobs).values({
      id: jobId,
      targetId,
      status: 'pending',
      totalFiles: 0,
      passedFiles: 0,
      failedFiles: 0,
      missingFiles: 0,
      failedItems: '[]',
      createdAt: new Date(),
    })

    await runVerifyJob(db, jobId)

    const jobs = await db.select().from(backupVerifyJobs)
    expect(jobs[0]?.missingFiles).toBe(1)
  })
})
