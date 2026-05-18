import { watch } from 'node:fs'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { dataSources, libraries } from '../db/schema.js'
import { createLogger } from '../logger.js'
import { scanLibrary } from './orchestrator.ts'
// import { scanLibrary } from './orchestrator.old.js'
import { toLocalPath } from './scanner.js'

const logger = createLogger('scheduler')

// Parse simple cron expressions. Returns interval in milliseconds, or null if unsupported.
// Supported patterns:
//   "*/N * * * *"   — every N minutes  (N: 1-59)
//   "0 */N * * *"   — every N hours    (N: 1-23)
export function parseCronInterval(expr: string): number | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, dom, month, dow] = parts
  if (dom !== '*' || month !== '*' || dow !== '*') return null

  if (min && /^\*\/\d+$/.test(min) && hour === '*') {
    const n = Number(min.slice(2))
    if (n >= 1 && n <= 59) return n * 60 * 1000
  }

  if (min === '0' && hour && /^\*\/\d+$/.test(hour)) {
    const n = Number(hour.slice(2))
    if (n >= 1 && n <= 23) return n * 60 * 60 * 1000
  }

  return null
}

export type TriggerFn = (
  db: LibSQLDatabase,
  libraryId: string,
) => Promise<unknown>

export type SchedulerHandle = {
  stop: () => void
}

const DEBOUNCE_MS = 2000

export async function startScheduler(
  db: LibSQLDatabase,
  trigger: TriggerFn = (d, id) => scanLibrary(d, id),
): Promise<SchedulerHandle> {
  const intervalTimers: ReturnType<typeof setInterval>[] = []
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const fsWatchers: ReturnType<typeof watch>[] = []

  const allLibraries = await db.select().from(libraries)
  logger.log('Scheduler starting', { libraries: allLibraries.length })

  for (const lib of allLibraries) {
    // Cron-style scheduled scans
    if (lib.scanSchedule) {
      const interval = parseCronInterval(lib.scanSchedule)
      if (interval !== null) {
        logger.log(`Cron schedule registered: "${lib.name}"`, {
          libraryId: lib.id,
          schedule: lib.scanSchedule,
          intervalMs: interval,
        })
        const timer = setInterval(() => {
          logger.log(`Scheduled scan triggered: "${lib.name}"`, {
            libraryId: lib.id,
          })
          trigger(db, lib.id).catch((err: unknown) => {
            logger.error(`Scheduled scan failed: "${lib.name}"`, {
              libraryId: lib.id,
              error: err,
            })
          })
        }, interval)
        intervalTimers.push(timer)
      } else {
        logger.warn(`Unsupported cron expression ignored: "${lib.name}"`, {
          libraryId: lib.id,
          schedule: lib.scanSchedule,
        })
      }
    }

    // Filesystem watchers for local data sources
    const sources = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.libraryId, lib.id))

    if (!lib.watchEnabled) continue

    for (const source of sources) {
      if (source.type !== 'local') continue
      // if (source.type !== 'local' || !source.enabled) continue

      try {
        const watchPath = toLocalPath(source.path)
        const watcher = watch(
          watchPath,
          // { recursive: source.recursive },
          { recursive: true },
          () => {
            // Debounce: wait DEBOUNCE_MS after the last change event
            const existing = debounceTimers.get(lib.id)
            if (existing !== undefined) clearTimeout(existing)
            const t = setTimeout(() => {
              debounceTimers.delete(lib.id)
              logger.log(`Watch-triggered scan: "${lib.name}"`, {
                libraryId: lib.id,
                path: watchPath,
              })
              trigger(db, lib.id).catch((err: unknown) => {
                logger.error(`Watch-triggered scan failed: "${lib.name}"`, {
                  libraryId: lib.id,
                  error: err,
                })
              })
            }, DEBOUNCE_MS)
            debounceTimers.set(lib.id, t)
          },
        )
        fsWatchers.push(watcher)
        logger.log(`Watching path: ${watchPath}`, {
          libraryId: lib.id,
          recursive: true,
          // recursive: source.recursive,
        })
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'ENOENT'
        ) {
          logger.warn(`Watch path does not exist: ${source.path}`, {
            libraryId: lib.id,
          })
          continue
        }

        logger.error(`Cannot watch path: ${source.path}`, {
          libraryId: lib.id,
          error: err,
        })
      }
    }
  }

  logger.log('Scheduler ready', {
    cronSchedules: intervalTimers.length,
    watchers: fsWatchers.length,
  })

  return {
    stop() {
      logger.log('Scheduler stopping', {
        cronSchedules: intervalTimers.length,
        watchers: fsWatchers.length,
      })
      for (const t of intervalTimers) clearInterval(t)
      for (const t of debounceTimers.values()) clearTimeout(t)
      for (const w of fsWatchers) w.close()
      intervalTimers.length = 0
      debounceTimers.clear()
      fsWatchers.length = 0
    },
  }
}
