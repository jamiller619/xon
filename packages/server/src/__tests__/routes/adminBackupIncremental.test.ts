import { copyFile, mkdir, stat, unlink } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../auth/password.ts'
import { openDatabase } from '../../db/db.ts'
import { migrateDatabase } from '../../db/migrate.ts'
import {
  backupFileState,
  backupJobs,
  backupTargets,
  dataSources,
  libraries,
  mediaItems,
  users,
} from '../../db/schema.ts'
import { signAccessToken } from '../../routes/auth.ts'

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}))

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`

describe('Incremental backup support', () => {
  let client: Client
  let db: LibSQLDatabase
  let targetId: string

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)

    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    vi.mocked(stat).mockResolvedValue({
      size: 1000,
      mtimeMs: 1_000_000,
    } as never)
    vi.mocked(unlink).mockResolvedValue(undefined)

    await db.insert(users).values({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await hashPassword('pass'),
      role: 'admin',
    })

    targetId = crypto.randomUUID()
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Local Target',
      type: 'local',
      config: JSON.stringify({ destPath: '/backups/media' }),
      enabled: true,
      removeDeleted: false,
      createdAt: new Date(),
    })
  })

  afterEach(() => {
    client.close()
    vi.clearAllMocks()
  })

  async function insertMediaItem(filePath: string, fileSize = 1000) {
    const libId = crypto.randomUUID()
    await db.insert(libraries).values({
      id: libId,
      name: 'Lib',
      mediaTypes: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const srcId = crypto.randomUUID()
    await db.insert(dataSources).values({
      id: srcId,
      libraryId: libId,
      type: 'local',
      path: '/media',
      recursive: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const itemId = crypto.randomUUID()
    await db.insert(mediaItems).values({
      id: itemId,
      libraryId: libId,
      dataSourceId: srcId,
      filePath,
      fileName: filePath.split('/').pop() ?? 'file',
      fileSize,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return itemId
  }

  async function runJob(scope = {}) {
    const { runMediaBackupJob } = await import(
      '../../routes/adminBackupMedia.js'
    )
    const jobId = crypto.randomUUID()
    await db.insert(backupJobs).values({
      id: jobId,
      targetId,
      scope: JSON.stringify(scope),
      status: 'pending',
      totalFiles: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      errors: '[]',
      createdAt: new Date(),
    })
    await runMediaBackupJob(db, jobId)
    const rows = await db
      .select()
      .from(backupJobs)
      .where(eq(backupJobs.id, jobId))
    return rows[0]
  }

  // ─── File state tracking ───────────────────────────────────────────────────

  it('stores file state after first backup', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    await runJob()

    const stateRows = await db
      .select()
      .from(backupFileState)
      .where(eq(backupFileState.targetId, targetId))
    expect(stateRows).toHaveLength(1)
    expect(stateRows[0]?.filePath).toBe('/media/movies/film.mkv')
    expect(stateRows[0]?.fileSize).toBe(1000)
    expect(stateRows[0]?.mtime).toBe(1_000_000)
  })

  it('skips unchanged files on second backup run', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // First run — copies the file
    await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    // Same mtime+size as stored state
    vi.mocked(stat).mockResolvedValue({
      size: 1000,
      mtimeMs: 1_000_000,
    } as never)

    // Second run — file unchanged, should skip
    const job = await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(0)
    expect(job?.skippedFiles).toBe(1)
    expect(job?.copiedFiles).toBe(0)
    expect(job?.status).toBe('completed')
  })

  it('copies file again when mtime has changed', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // First run
    await runJob()
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    // Different mtime — file was modified
    vi.mocked(stat).mockResolvedValue({
      size: 1000,
      mtimeMs: 2_000_000,
    } as never)

    // Second run — file changed (mtime differs), should copy
    const job = await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(1)
    expect(job?.copiedFiles).toBe(1)
    expect(job?.skippedFiles).toBe(0)
  })

  it('copies file again when size has changed', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // First run
    await runJob()
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    // Different size — file was modified
    vi.mocked(stat).mockResolvedValue({
      size: 2000,
      mtimeMs: 1_000_000,
    } as never)

    const job = await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(1)
    expect(job?.copiedFiles).toBe(1)
    expect(job?.skippedFiles).toBe(0)
  })

  it('updates file state after re-copying a changed file', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // First run — size 1000, mtime 1_000_000
    await runJob()

    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    vi.mocked(stat).mockResolvedValue({
      size: 2000,
      mtimeMs: 3_000_000,
    } as never)

    // Second run — file changed
    await runJob()

    const stateRows = await db
      .select()
      .from(backupFileState)
      .where(eq(backupFileState.targetId, targetId))
    expect(stateRows).toHaveLength(1)
    expect(stateRows[0]?.fileSize).toBe(2000)
    expect(stateRows[0]?.mtime).toBe(3_000_000)
  })

  it('copies new files even if other files are already backed up', async () => {
    await insertMediaItem('/media/movies/old.mkv')

    // First run backs up old.mkv
    await runJob()
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    vi.mocked(stat).mockResolvedValue({
      size: 1000,
      mtimeMs: 1_000_000,
    } as never)

    // Add a new file
    await insertMediaItem('/media/movies/new.mkv')

    // Second run — old.mkv skipped, new.mkv copied
    const job = await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(copyFile)).toHaveBeenCalledWith(
      '/media/movies/new.mkv',
      expect.stringContaining('new.mkv'),
    )
    expect(job?.skippedFiles).toBe(1)
    expect(job?.copiedFiles).toBe(1)
  })

  it('proceeds to copy when stat fails (treats file as new/changed)', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // Pre-seed state so the file looks backed-up
    await db.insert(backupFileState).values({
      id: crypto.randomUUID(),
      targetId,
      filePath: '/media/movies/film.mkv',
      fileSize: 1000,
      mtime: 1_000_000,
      backedUpAt: new Date(),
    })

    // stat fails — should not skip, should attempt copy
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))

    const job = await runJob()
    expect(vi.mocked(copyFile)).toHaveBeenCalledTimes(1)
    expect(job?.copiedFiles).toBe(1)
  })

  // ─── removeDeleted policy ─────────────────────────────────────────────────

  it('removes deleted source files from backup when removeDeleted is true', async () => {
    // Set removeDeleted on target
    await db
      .update(backupTargets)
      .set({ removeDeleted: true })
      .where(eq(backupTargets.id, targetId))

    // Seed state for a file that no longer exists in media_items
    await db.insert(backupFileState).values({
      id: crypto.randomUUID(),
      targetId,
      filePath: '/media/movies/deleted.mkv',
      fileSize: 500,
      mtime: 999_000,
      backedUpAt: new Date(),
    })

    // Insert a different file that still exists
    await insertMediaItem('/media/movies/current.mkv')

    await runJob()

    // unlink should have been called for the deleted file
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining('deleted.mkv'),
    )

    // State entry for deleted file should be removed
    const stateRows = await db
      .select()
      .from(backupFileState)
      .where(eq(backupFileState.targetId, targetId))
    const paths = stateRows.map((r) => r.filePath)
    expect(paths).not.toContain('/media/movies/deleted.mkv')
  })

  it('does not remove files when removeDeleted is false (default)', async () => {
    // Seed stale state
    await db.insert(backupFileState).values({
      id: crypto.randomUUID(),
      targetId,
      filePath: '/media/movies/stale.mkv',
      fileSize: 500,
      mtime: 999_000,
      backedUpAt: new Date(),
    })

    await insertMediaItem('/media/movies/current.mkv')

    await runJob()

    // unlink should NOT have been called
    expect(vi.mocked(unlink)).not.toHaveBeenCalled()

    // Stale state entry should still be there
    const stateRows = await db
      .select()
      .from(backupFileState)
      .where(eq(backupFileState.targetId, targetId))
    const paths = stateRows.map((r) => r.filePath)
    expect(paths).toContain('/media/movies/stale.mkv')
  })

  it('job skippedFiles field is returned via GET jobs/:id', async () => {
    await insertMediaItem('/media/movies/film.mkv')

    // First run — copies
    const job1 = await runJob()
    expect(job1?.skippedFiles).toBe(0)

    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(copyFile).mockResolvedValue(undefined)
    vi.mocked(stat).mockResolvedValue({
      size: 1000,
      mtimeMs: 1_000_000,
    } as never)

    // Second run — skips unchanged
    const job2 = await runJob()
    expect(job2?.skippedFiles).toBe(1)
  })
})

// Suppress unused import warning — AUTH token is referenced only if needed in future tests
void ADMIN_AUTH
