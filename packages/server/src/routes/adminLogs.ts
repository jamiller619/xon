import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import config from '../config.ts'

const DEFAULT_LINES = 500
const MAX_LINES = 5000

/** Rotated log file names: `current.jsonl` or `YYYY-MM-DD[.N].jsonl`. */
const LOG_FILE_PATTERN = /^[\w-]+(\.\d+)?\.jsonl$/

function parseLimit(value: string | undefined): number {
  const requested = Number(value)
  return Number.isFinite(requested) && requested > 0
    ? Math.min(requested, MAX_LINES)
    : DEFAULT_LINES
}

async function readEntries(
  logFile: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  let raw: string
  try {
    raw = await readFile(logFile, 'utf8')
  } catch {
    return []
  }

  return raw
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
}

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
    const limit = parseLimit(c.req.query('lines'))
    const logFile = join(config.get('appdata.logsPath'), 'current.jsonl')

    return c.json({ lines: await readEntries(logFile, limit) })
  })

  /**
   * GET /admin/logs/files
   * Lists the JSONL log files in the logs directory, newest first.
   */
  router.get('/files', async (c) => {
    const logsDir = config.get('appdata.logsPath')

    let names: string[]
    try {
      names = await readdir(logsDir)
    } catch {
      return c.json({ files: [] })
    }

    const files = await Promise.all(
      names
        .filter((name) => LOG_FILE_PATTERN.test(name))
        .map(async (name) => {
          const info = await stat(join(logsDir, name))
          return { name, size: info.size, mtime: info.mtime.toISOString() }
        }),
    )

    files.sort((a, b) => b.mtime.localeCompare(a.mtime))

    return c.json({ files })
  })

  /**
   * GET /admin/logs/files/:name?lines=N
   * Returns the last N parsed entries from a specific rotated log file.
   */
  router.get('/files/:name', async (c) => {
    const name = c.req.param('name')

    // Strict allowlist pattern — also guards against path traversal.
    if (!LOG_FILE_PATTERN.test(name)) {
      return c.json({ error: 'Invalid log file name' }, 400)
    }

    const limit = parseLimit(c.req.query('lines'))
    const logFile = join(config.get('appdata.logsPath'), name)

    return c.json({ lines: await readEntries(logFile, limit) })
  })

  return router
}
