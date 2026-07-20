import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.ts'
import { appCache } from '../cache.ts'
import { libraries } from '../db/schema.ts'
import { emitEvent } from '../events.ts'
import { validate } from '../http/validate.ts'
import { emitPluginEvent } from '../plugins/pluginManager.ts'
import type { ScannerHandle } from '../scanner/scannerHandle.ts'
import { type ScanState, scanRegistry } from '../scanner/scanRegistry.ts'
import { parseCronInterval } from '../scanner/scheduler.ts'

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
  scannerHandle: ScannerHandle,
  libraryId: string,
): boolean {
  return runScanJob(libraryId, () => scannerHandle.startScan(libraryId))
}

/**
 * Fire-and-forget metadata refresh for a library, or a single media item when
 * mediaItemId is given. Shares the scan registry, so a refresh and a scan of
 * the same library never run concurrently and reuse the same progress UI.
 * Returns false if a scan or refresh is already running.
 */
export function triggerMetadataRefresh(
  scannerHandle: ScannerHandle,
  libraryId: string,
  mediaItemId?: string,
): boolean {
  return runScanJob(libraryId, () =>
    scannerHandle.refreshMetadata(libraryId, mediaItemId),
  )
}

function runScanJob(
  libraryId: string,
  run: () => Promise<Awaited<ReturnType<ScannerHandle['startScan']>>>,
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

  run()
    .then((summary) => {
      state.status = 'completed'
      state.summary = summary

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
    .catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      state.status = 'failed'
      state.error = errorMessage
      emitEvent({
        type: 'scan:error',
        payload: { libraryId, error: errorMessage },
      })
    })

  return true
}

export function makeScanRouter(
  db: LibSQLDatabase,
  scannerHandle: ScannerHandle,
): Hono {
  const router = new Hono()

  // POST / — trigger scan (mounted at /:libraryId/scan) (manager+)
  router.post('/', requireAuth(), (c) => {
    const libraryId = c.req.param('libraryId') as string
    const started = triggerLibraryScan(scannerHandle, libraryId)
    if (!started) {
      return c.json({ status: 'already_running' }, 409)
    }
    return c.json({ status: 'started' }, 202)
  })

  // POST /refresh — re-run metadata plugins for the whole library, or a
  // single item when the body carries { mediaItemId } (mounted at
  // /:libraryId/scan/refresh) (manager+)
  router.post('/refresh', requireAuth(), async (c) => {
    const libraryId = c.req.param('libraryId') as string

    const body = (await c.req.json().catch(() => ({}))) as {
      mediaItemId?: unknown
    }
    const mediaItemId =
      typeof body.mediaItemId === 'string' ? body.mediaItemId : undefined

    const started = triggerMetadataRefresh(scannerHandle, libraryId, mediaItemId)
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
    requireAuth(),
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
  //   requireAuth(),
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
