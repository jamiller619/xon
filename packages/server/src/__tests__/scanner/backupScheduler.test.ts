import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../db/db.js'
import { migrateDatabase } from '../../db/migrate.js'
import { backupJobs, backupTargets } from '../../db/schema.js'
import {
  applyRetentionPolicy,
  getNextCronTime,
  parseCronExpression,
  validateCronExpression,
} from '../../scanner/backupScheduler.js'

// ---------------------------------------------------------------------------
// parseCronExpression / validateCronExpression
// ---------------------------------------------------------------------------

describe('parseCronExpression', () => {
  it('parses a simple daily cron', () => {
    const parsed = parseCronExpression('0 2 * * *')
    expect(parsed).not.toBeNull()
    expect(parsed?.minutes).toEqual([0])
    expect(parsed?.hours).toEqual([2])
    expect(parsed?.doms).toEqual(expect.arrayContaining([1, 15, 31]))
    expect(parsed?.months).toEqual(expect.arrayContaining([1, 6, 12]))
    expect(parsed?.dows).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('parses every minute', () => {
    const parsed = parseCronExpression('* * * * *')
    expect(parsed).not.toBeNull()
    expect(parsed?.minutes).toHaveLength(60)
    expect(parsed?.hours).toHaveLength(24)
  })

  it('parses step expressions', () => {
    const parsed = parseCronExpression('*/15 * * * *')
    expect(parsed?.minutes).toEqual([0, 15, 30, 45])
  })

  it('parses range expressions', () => {
    const parsed = parseCronExpression('0 9-17 * * *')
    expect(parsed?.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('parses list expressions', () => {
    const parsed = parseCronExpression('0 0,12 * * *')
    expect(parsed?.hours).toEqual([0, 12])
  })

  it('normalizes dow 7 to 0 (Sunday)', () => {
    const parsed = parseCronExpression('0 0 * * 7')
    expect(parsed?.dows).toEqual([0])
  })

  it('returns null for too few fields', () => {
    expect(parseCronExpression('* * * *')).toBeNull()
  })

  it('returns null for invalid characters', () => {
    expect(parseCronExpression('x * * * *')).toBeNull()
  })

  it('returns null for out-of-range values', () => {
    expect(parseCronExpression('60 * * * *')).toBeNull() // minute 60 is invalid
  })
})

describe('validateCronExpression', () => {
  it('returns valid: true for a valid expression', () => {
    const result = validateCronExpression('0 3 * * *')
    expect(result.valid).toBe(true)
  })

  it('returns valid: false with error for an invalid expression', () => {
    const result = validateCronExpression('not-valid')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('Invalid cron expression')
    }
  })
})

// ---------------------------------------------------------------------------
// getNextCronTime
// ---------------------------------------------------------------------------

describe('getNextCronTime', () => {
  it('returns the next matching minute for * * * * *', () => {
    const from = new Date('2024-01-01T10:00:00Z')
    const next = getNextCronTime('* * * * *', from)
    expect(next).not.toBeNull()
    // Next minute is 10:01
    expect(next?.getUTCHours()).toBe(10)
    expect(next?.getUTCMinutes()).toBe(1)
  })

  it('returns next hour mark for 0 * * * *', () => {
    const from = new Date('2024-01-01T10:30:00Z')
    const next = getNextCronTime('0 * * * *', from)
    expect(next).not.toBeNull()
    expect(next?.getUTCHours()).toBe(11)
    expect(next?.getUTCMinutes()).toBe(0)
  })

  it('returns next day for 0 2 * * * when past 2am', () => {
    const from = new Date('2024-01-01T03:00:00Z')
    const next = getNextCronTime('0 2 * * *', from)
    expect(next).not.toBeNull()
    expect(next?.getUTCDate()).toBe(2)
    expect(next?.getUTCHours()).toBe(2)
    expect(next?.getUTCMinutes()).toBe(0)
  })

  it('returns same day if schedule is ahead', () => {
    const from = new Date('2024-01-01T01:00:00Z')
    const next = getNextCronTime('0 2 * * *', from)
    expect(next).not.toBeNull()
    expect(next?.getUTCDate()).toBe(1)
    expect(next?.getUTCHours()).toBe(2)
  })

  it('returns null for an invalid expression', () => {
    const next = getNextCronTime('invalid', new Date())
    expect(next).toBeNull()
  })

  it('handles every 15 minutes', () => {
    const from = new Date('2024-01-01T10:07:00Z')
    const next = getNextCronTime('*/15 * * * *', from)
    expect(next).not.toBeNull()
    expect(next?.getUTCMinutes()).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// applyRetentionPolicy
// ---------------------------------------------------------------------------

describe('applyRetentionPolicy', () => {
  let client: Client
  let db: LibSQLDatabase

  beforeEach(async () => {
    ;({ client, db } = await openDatabase(':memory:'))
    await migrateDatabase(db)
  })

  afterEach(() => {
    client.close()
  })

  async function createTarget(
    id: string,
    keepCount?: number,
    keepDays?: number,
  ) {
    await db.insert(backupTargets).values({
      id,
      name: `Target ${id}`,
      type: 'local',
      config: '{}',
      enabled: true,
      removeDeleted: false,
      retentionKeepCount: keepCount ?? null,
      retentionKeepDays: keepDays ?? null,
    })
  }

  async function createJob(id: string, targetId: string, daysAgo: number) {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    await db.insert(backupJobs).values({
      id,
      targetId,
      scope: '{}',
      status: 'completed',
      totalFiles: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      errors: '[]',
      createdAt: d,
    })
  }

  it('does nothing when no retention policy set', async () => {
    await createTarget('t1')
    await createJob('j1', 't1', 0)
    await createJob('j2', 't1', 100)

    await applyRetentionPolicy(db, 't1')

    const jobs = await db.select().from(backupJobs)
    expect(jobs).toHaveLength(2)
  })

  it('keeps N most recent jobs by retentionKeepCount', async () => {
    await createTarget('t2', 2)
    await createJob('j1', 't2', 0)
    await createJob('j2', 't2', 1)
    await createJob('j3', 't2', 2)
    await createJob('j4', 't2', 3)

    await applyRetentionPolicy(db, 't2')

    const jobs = await db.select().from(backupJobs)
    expect(jobs).toHaveLength(2)
    const ids = jobs.map((j) => j.id)
    expect(ids).toContain('j1')
    expect(ids).toContain('j2')
    expect(ids).not.toContain('j3')
    expect(ids).not.toContain('j4')
  })

  it('deletes all jobs when retentionKeepCount is 0', async () => {
    await createTarget('t3', 0)
    await createJob('j1', 't3', 0)
    await createJob('j2', 't3', 1)

    await applyRetentionPolicy(db, 't3')

    const jobs = await db.select().from(backupJobs)
    expect(jobs).toHaveLength(0)
  })

  it('prunes jobs older than retentionKeepDays', async () => {
    await createTarget('t4', undefined, 7)
    await createJob('j1', 't4', 0) // today
    await createJob('j2', 't4', 5) // 5 days ago — within retention
    await createJob('j3', 't4', 10) // 10 days ago — outside retention
    await createJob('j4', 't4', 30) // 30 days ago — outside retention

    await applyRetentionPolicy(db, 't4')

    const jobs = await db.select().from(backupJobs)
    expect(jobs).toHaveLength(2)
    const ids = jobs.map((j) => j.id)
    expect(ids).toContain('j1')
    expect(ids).toContain('j2')
    expect(ids).not.toContain('j3')
    expect(ids).not.toContain('j4')
  })

  it('does nothing for unknown target', async () => {
    await createTarget('t5')
    await createJob('j1', 't5', 0)

    await applyRetentionPolicy(db, 'nonexistent')

    const jobs = await db.select().from(backupJobs)
    expect(jobs).toHaveLength(1)
  })
})
