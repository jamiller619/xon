import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { backupJobs, backupTargets } from '../db/schema.js'

// ---------------------------------------------------------------------------
// Cron expression parsing
// ---------------------------------------------------------------------------

/**
 * Expand a single cron field string into the sorted set of valid integer values.
 *
 * Supports: star, N, N-M, N/S, star/S, N-M/S, comma-separated lists.
 *
 * @param field  Raw field string (e.g. "0", "star/5", "1-5", "0,15,30,45")
 * @param min    Minimum allowed value (inclusive)
 * @param max    Maximum allowed value (inclusive)
 */
function expandCronField(
  field: string,
  min: number,
  max: number,
): number[] | null {
  const result = new Set<number>()

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) result.add(i)
      continue
    }

    if (part.includes('/')) {
      const slashIdx = part.indexOf('/')
      const rangeStr = part.slice(0, slashIdx)
      const stepStr = part.slice(slashIdx + 1)
      const step = Number.parseInt(stepStr, 10)
      if (Number.isNaN(step) || step < 1) return null

      let start = min
      let end = max

      if (rangeStr !== '*') {
        if (rangeStr.includes('-')) {
          const dashIdx = rangeStr.indexOf('-')
          start = Number.parseInt(rangeStr.slice(0, dashIdx), 10)
          end = Number.parseInt(rangeStr.slice(dashIdx + 1), 10)
          if (Number.isNaN(start) || Number.isNaN(end)) return null
        } else {
          start = Number.parseInt(rangeStr, 10)
          if (Number.isNaN(start)) return null
          end = max
        }
      }

      for (let i = start; i <= end; i += step) result.add(i)
      continue
    }

    if (part.includes('-')) {
      const dashIdx = part.indexOf('-')
      const start = Number.parseInt(part.slice(0, dashIdx), 10)
      const end = Number.parseInt(part.slice(dashIdx + 1), 10)
      if (Number.isNaN(start) || Number.isNaN(end)) return null
      for (let i = start; i <= end; i++) result.add(i)
      continue
    }

    const v = Number.parseInt(part, 10)
    if (Number.isNaN(v)) return null
    result.add(v)
  }

  // Validate all values are in range
  for (const v of result) {
    if (v < min || v > max) return null
  }

  return [...result].sort((a, b) => a - b)
}

interface ParsedCron {
  minutes: number[]
  hours: number[]
  doms: number[] // day of month
  months: number[]
  dows: number[] // day of week (0=Sun..6=Sat; 7 also treated as Sun)
}

/**
 * Parse a 5-field cron expression. Returns null if the expression is invalid.
 */
export function parseCronExpression(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minF, hourF, domF, monthF, dowF] = parts as [
    string,
    string,
    string,
    string,
    string,
  ]

  const minutes = expandCronField(minF, 0, 59)
  const hours = expandCronField(hourF, 0, 23)
  const doms = expandCronField(domF, 1, 31)
  const months = expandCronField(monthF, 1, 12)
  // Normalize dow: 7 → 0 (both mean Sunday)
  const dowsRaw = expandCronField(dowF, 0, 7)

  if (!minutes || !hours || !doms || !months || !dowsRaw) return null

  const dowSet = new Set(dowsRaw.map((d) => (d === 7 ? 0 : d)))
  const dows = [...dowSet].sort((a, b) => a - b)

  return { minutes, hours, doms, months, dows }
}

/**
 * Validate a cron expression and return error message if invalid.
 */
export function validateCronExpression(
  expr: string,
): { valid: true } | { valid: false; error: string } {
  const parsed = parseCronExpression(expr)
  if (!parsed) {
    return {
      valid: false,
      error: `Invalid cron expression "${expr}". Expected 5 fields: minute hour dom month dow`,
    }
  }
  return { valid: true }
}

/**
 * Compute the next time (after `from`) that the cron expression fires.
 *
 * Returns null if no match is found within 4 years (abnormal expressions).
 * The iteration advances minute-by-minute which is correct for all standard
 * cron schedules and completes in at most ~2M iterations (well under 5ms).
 */
export function getNextCronTime(expr: string, from: Date): Date | null {
  const parsed = parseCronExpression(expr)
  if (!parsed) return null

  // Work in UTC to avoid DST/timezone surprises.
  // Start from the next UTC minute after `from`.
  const startMs = (Math.floor(from.getTime() / 60_000) + 1) * 60_000
  const limitMs = startMs + 4 * 365 * 24 * 60 * 60 * 1_000

  let ms = startMs

  while (ms < limitMs) {
    const d = new Date(ms)
    const month = d.getUTCMonth() + 1 // 1-12
    const dom = d.getUTCDate() // 1-31
    const dow = d.getUTCDay() // 0-6
    const hour = d.getUTCHours()
    const minute = d.getUTCMinutes()

    if (!parsed.months.includes(month)) {
      // Skip to first day of next UTC month
      const next = new Date(0)
      next.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      next.setUTCHours(0, 0, 0, 0)
      ms = next.getTime()
      continue
    }

    if (!parsed.doms.includes(dom) || !parsed.dows.includes(dow)) {
      // Skip to next UTC day
      const next = new Date(0)
      next.setUTCFullYear(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() + 1,
      )
      next.setUTCHours(0, 0, 0, 0)
      ms = next.getTime()
      continue
    }

    if (!parsed.hours.includes(hour)) {
      // Skip to next UTC hour
      const next = new Date(0)
      next.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      next.setUTCHours(d.getUTCHours() + 1, 0, 0, 0)
      ms = next.getTime()
      continue
    }

    if (!parsed.minutes.includes(minute)) {
      ms += 60_000
      continue
    }

    return new Date(ms)
  }

  return null
}

// ---------------------------------------------------------------------------
// Retention policy
// ---------------------------------------------------------------------------

/**
 * Prune old backup jobs for a target based on its retention policy.
 *
 * - `retentionKeepCount`: delete jobs beyond the N most recent (by createdAt DESC)
 * - `retentionKeepDays`: delete jobs older than N days
 *
 * Both policies are applied if set.
 */
export async function applyRetentionPolicy(
  db: LibSQLDatabase,
  targetId: string,
): Promise<void> {
  const targetRows = await db
    .select({
      retentionKeepCount: backupTargets.retentionKeepCount,
      retentionKeepDays: backupTargets.retentionKeepDays,
    })
    .from(backupTargets)
    .where(eq(backupTargets.id, targetId))

  const target = targetRows[0]
  if (!target) return

  const { retentionKeepCount, retentionKeepDays } = target

  if (
    retentionKeepCount !== null &&
    retentionKeepCount !== undefined &&
    retentionKeepCount >= 0
  ) {
    // Find job ids to keep (N most recent by createdAt)
    const keepRows = await db
      .select({ id: backupJobs.id })
      .from(backupJobs)
      .where(eq(backupJobs.targetId, targetId))
      .orderBy(desc(backupJobs.createdAt))
      .limit(retentionKeepCount)

    const keepIds = keepRows.map((r) => r.id)

    if (keepIds.length === 0) {
      // Delete all jobs for this target
      await db.delete(backupJobs).where(eq(backupJobs.targetId, targetId))
    } else {
      // Delete jobs not in the keep list — use a subquery via raw SQL
      // Drizzle doesn't natively support notInArray for deletion with subquery, so
      // we fetch all ids and filter manually
      const allRows = await db
        .select({ id: backupJobs.id })
        .from(backupJobs)
        .where(eq(backupJobs.targetId, targetId))

      const keepSet = new Set(keepIds)
      const toDelete = allRows
        .filter((r) => !keepSet.has(r.id))
        .map((r) => r.id)

      for (const id of toDelete) {
        await db.delete(backupJobs).where(eq(backupJobs.id, id))
      }
    }
  }

  if (
    retentionKeepDays !== null &&
    retentionKeepDays !== undefined &&
    retentionKeepDays >= 0
  ) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionKeepDays)

    await db
      .delete(backupJobs)
      .where(
        and(
          eq(backupJobs.targetId, targetId),
          lt(backupJobs.createdAt, cutoff),
        ),
      )
  }
}

// ---------------------------------------------------------------------------
// Background scheduler
// ---------------------------------------------------------------------------

let _schedulerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start the backup scheduler. Runs every 60 seconds and triggers backup jobs
 * for any enabled targets whose `nextScheduledAt` is due.
 *
 * After triggering, updates `nextScheduledAt` to the next computed run time.
 */
export function startBackupScheduler(db: LibSQLDatabase): void {
  if (_schedulerInterval !== null) return // already running

  const tick = async () => {
    try {
      const now = new Date()
      // Find targets with a schedule that are due
      const due = await db
        .select()
        .from(backupTargets)
        .where(
          and(
            eq(backupTargets.enabled, true),
            sql`${backupTargets.schedule} IS NOT NULL`,
            sql`${backupTargets.nextScheduledAt} IS NOT NULL`,
            sql`${backupTargets.nextScheduledAt} <= ${now.getTime()}`,
          ),
        )

      for (const target of due) {
        // Trigger a backup job (fire-and-forget)
        const { makeAdminBackupMediaRouter: _ } = await import(
          '../routes/adminBackupMedia.js'
        )
        // Directly call runMediaBackupJob after creating the job record
        const { runMediaBackupJob } = await import(
          '../routes/adminBackupMedia.js'
        )
        const jobId = crypto.randomUUID()
        await db.insert(backupJobs).values({
          id: jobId,
          targetId: target.id,
          scope: '{}',
          status: 'pending',
          totalFiles: 0,
          copiedFiles: 0,
          skippedFiles: 0,
          errors: '[]',
          createdAt: new Date(),
        })
        runMediaBackupJob(db, jobId).catch(() => {})

        // Update nextScheduledAt
        if (target.schedule) {
          const next = getNextCronTime(target.schedule, now)
          await db
            .update(backupTargets)
            .set({ nextScheduledAt: next ?? undefined })
            .where(eq(backupTargets.id, target.id))
        }
      }
    } catch {
      // Scheduler errors are non-fatal
    }
  }

  _schedulerInterval = setInterval(() => {
    tick().catch(() => {})
  }, 60_000)
}

/**
 * Stop the backup scheduler.
 */
export function stopBackupScheduler(): void {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval)
    _schedulerInterval = null
  }
}
