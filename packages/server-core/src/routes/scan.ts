import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireRole } from '../auth/rbac.js'
import { appCache } from '../cache.js'
import { libraries } from '../db/schema.js'
import { emitEvent } from '../events.js'
import { validate } from '../http/validate.js'
import { emitPluginEvent } from '../plugins/pluginManager.js'
import { scanLibrary } from '../scanner/orchestrator.js'
import { type ScanState, scanRegistry } from '../scanner/scanRegistry.js'
import { parseCronInterval } from '../scanner/scheduler.js'

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

export function makeScanRouter(db: LibSQLDatabase): Hono {
  const router = new Hono()

  // POST / — trigger scan (mounted at /:libraryId/scan) (manager+)
  router.post('/', requireRole('manager'), (c) => {
    const libraryId = c.req.param('libraryId') as string

    const current = scanRegistry.get(libraryId)
    if (current?.status === 'running') {
      return c.json({ status: 'already_running' }, 409)
    }

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
    scanLibrary(db, libraryId, (progress) => {
      state.progress = progress
      const percentComplete =
        progress.totalFiles > 0
          ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
          : 0
      emitEvent({
        type: 'scan:progress',
        payload: {
          libraryId,
          fileCount: progress.totalFiles,
          currentFile: progress.currentFile,
          percentComplete,
        },
      })
    })
      .then(async (summary) => {
        const duration = Date.now() - scanStartedAt
        state.status = 'completed'
        state.summary = summary
        await db
          .update(libraries)
          .set({
            lastScanResult: 'completed',
            lastScanDuration: duration,
            updatedAt: new Date(),
          })
          .where(eq(libraries.id, libraryId))
        // Invalidate caches so updated counts and library list are served fresh
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
        await db
          .update(libraries)
          .set({
            lastScanResult: 'failed',
            lastScanDuration: duration,
            updatedAt: new Date(),
          })
          .where(eq(libraries.id, libraryId))
        emitEvent({
          type: 'scan:error',
          payload: { libraryId, error: errorMessage },
        })
      })

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
    requireRole('manager'),
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
  router.put(
    '/watch',
    requireRole('manager'),
    validate('json', watchSchema),
    async (c) => {
      const libraryId = c.req.param('libraryId') as string
      const { watchEnabled } = c.req.valid('json')

      const existing = await db
        .select()
        .from(libraries)
        .where(eq(libraries.id, libraryId))
      if (existing.length === 0) return c.json({ error: 'Not found' }, 404)

      await db
        .update(libraries)
        .set({ watchEnabled, updatedAt: new Date() })
        .where(eq(libraries.id, libraryId))

      const updated = await db
        .select()
        .from(libraries)
        .where(eq(libraries.id, libraryId))
      return c.json(updated[0])
    },
  )

  return router
}
