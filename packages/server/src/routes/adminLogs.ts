import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import config from '../config.ts'

const DEFAULT_LINES = 500
const MAX_LINES = 5000

/**
 * Admin-only router exposing recent server log output for the live terminal
 * view. The web client backfills history from here on mount, then receives new
 * lines in real time via the `log:line` WebSocket event.
 */
export function makeAdminLogsRouter(): Hono {
  const router = new Hono()

  /**
   * GET /admin/logs?lines=N
   * Returns the last N parsed entries from the current rotating log file.
   */
  router.get('/', async (c) => {
    const requested = Number(c.req.query('lines'))
    const limit =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, MAX_LINES)
        : DEFAULT_LINES

    const logFile = join(config.get('appdata.logsPath'), 'current.jsonl')

    let raw: string
    try {
      raw = await readFile(logFile, 'utf8')
    } catch {
      // Log file may not exist yet (no rotation has occurred).
      return c.json({ lines: [] })
    }

    const entries = raw
      .split('\n')
      .filter((line) => line.length > 0)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry != null)

    return c.json({ lines: entries })
  })

  return router
}
