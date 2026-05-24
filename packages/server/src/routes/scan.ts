import { UserRole } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireRole } from '../auth/rbac.ts'
import { appCache } from '../cache.ts'
import { libraries } from '../db/schema.ts'
import { emitEvent } from '../events.ts'
import { validate } from '../http/validate.ts'
import { emitPluginEvent } from '../plugins/pluginManager.ts'
import { type ScanState, scanRegistry } from '../scanner/scanRegistry.ts'
import { parseCronInterval } from '../scanner/scheduler.ts'
import { spawnScan } from '../scanner/spawnScan.ts'

const scheduleSchema = z.object({
  scanSchedule: z
    .string()
    .nullable()
    .refine(
      (v) => v === null || parseCronInterval(v) !== null,
      "Invalid or unsupported cron expression. Supported: '*/N * * * *' or '0 */N * * *'",
    ),
})

const watchSchema = z.object({
  watchEnabled: z.boolean(),
})

/**
 * Fire-and-forget scan for the given library.
 * Returns false if a scan is already running, true if one was started.
 */
export function triggerLibraryScan(
  _db: LibSQLDatabase,
  libraryId: string,
): boolean {
  const current = scanRegistry.get(libraryId)
  if (current?.status === 'running') return false

  const state: ScanState = {
    status: 'running',
    startedAt: new Date(),
    progress: null,
    summary: null,
    error: null,
  }
  scanRegistry.set(libraryId, state)
  emitPluginEvent('scan:start', { libraryId })

  const scanStartedAt = Date.now()

  // scanLibrary(db, libraryId, (progress) => {
  //   state.progress = progress
  //   const percentComplete =
  //     progress.totalFiles > 0
  //       ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
  //       : 0
  //   emitEvent({
  //     type: 'scan:progress',
  //     payload: {
  //       libraryId,
  //       fileCount: progress.totalFiles,
  //       currentFile: progress.currentFile,
  //       percentComplete,
  //     },
  //   })
  // })
  spawnScan(libraryId)
    .then(async (summary) => {
      const duration = Date.now() - scanStartedAt
      state.status = 'completed'
      state.summary = summary

      // await db
      //   .update(libraries)
      //   .set({
      //     lastScanResult: 'completed',
      //     lastScanDuration: duration,
      //     updatedAt: new Date(),
      //   })
      //   .where(eq(libraries.id, libraryId))

      appCache.invalidate(`media:count:${libraryId}`)
      appCache.invalidate('libraries:all')

      emitEvent({
        type: 'scan:complete',
        payload: {
          libraryId,
          newItems: summary.newItems,
          updatedItems: summary.updatedItems,
          removedItems: summary.removedItems,
          totalDiscovered: summary.totalDiscovered,
        },
      })
      emitPluginEvent('scan:complete', {
        libraryId,
        itemsFound: summary.totalDiscovered,
      })
    })
    .catch(async (err: unknown) => {
      const duration = Date.now() - scanStartedAt
      state.status = 'failed'
      const errorMessage = err instanceof Error ? err.message : String(err)
      state.error = errorMessage
      // await db
      //   .update(libraries)
      //   .set({
      //     lastScanResult: 'failed',
      //     lastScanDuration: duration,
      //     updatedAt: new Date(),
      //   })
      //   .where(eq(libraries.id, libraryId))
      emitEvent({
        type: 'scan:error',
        payload: { libraryId, error: errorMessage },
      })
    })

  return true
}

export function makeScanRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // POST / — trigger scan (mounted at /:libraryId/scan) (manager+)
  router.post('/', requireRole(UserRole.User), (c) => {
    const libraryId = c.req.param('libraryId') as string
    const started = triggerLibraryScan(db, libraryId)
    if (!started) {
      return c.json({ status: 'already_running' }, 409)
    }
    return c.json({ status: 'started' }, 202)
  })

  // GET /status — get scan status (mounted at /:libraryId/scan/status)
  router.get('/status', (c) => {
    const libraryId = c.req.param('libraryId') as string

    const state = scanRegistry.get(libraryId)
    if (!state) {
      return c.json({ status: 'idle' })
    }

    return c.json({
      status: state.status,
      startedAt: state.startedAt.toISOString(),
      progress: state.progress,
      summary: state.summary,
      error: state.error,
    })
  })

  // PUT /schedule — update scan schedule for a library (manager+)
  router.put(
    '/schedule',
    requireRole(UserRole.User),
    validate('json', scheduleSchema),
    async (c) => {
      const libraryId = c.req.param('libraryId') as string
      const { scanSchedule } = c.req.valid('json')

      const existing = await db
        .select()
        .from(libraries)
        .where(eq(libraries.id, libraryId))
      if (existing.length === 0) return c.json({ error: 'Not found' }, 404)

      await db
        .update(libraries)
        .set({ scanSchedule, updatedAt: new Date() })
        .where(eq(libraries.id, libraryId))

      const updated = await db
        .select()
        .from(libraries)
        .where(eq(libraries.id, libraryId))
      return c.json(updated[0])
    },
  )

  // PUT /watch — enable/disable filesystem watch for a library (manager+)
  // router.put(
  //   '/watch',
  //   requireRole(UserRole.User),
  //   validate('json', watchSchema),
  //   async (c) => {
  //     const libraryId = c.req.param('libraryId') as string
  //     const { watchEnabled } = c.req.valid('json')

  //     const existing = await db
  //       .select()
  //       .from(libraries)
  //       .where(eq(libraries.id, libraryId))
  //     if (existing.length === 0) return c.json({ error: 'Not found' }, 404)

  //     await db
  //       .update(libraries)
  //       .set({ watchEnabled, updatedAt: new Date() })
  //       .where(eq(libraries.id, libraryId))

  //     const updated = await db
  //       .select()
  //       .from(libraries)
  //       .where(eq(libraries.id, libraryId))
  //     return c.json(updated[0])
  //   },
  // )

  return router
}
