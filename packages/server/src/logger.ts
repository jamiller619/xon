import { mkdir } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createStream, type RotatingFileStream } from 'rotating-file-stream'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type Logger = {
  log: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let currentLevel: LogLevel = 'info'
let stream: RotatingFileStream | null = null

function serializeArg(arg: unknown): Record<string, unknown> {
  if (arg instanceof Error) {
    return { error: { message: arg.message, stack: arg.stack, name: arg.name } }
  }
  if (arg !== null && typeof arg === 'object' && !Array.isArray(arg)) {
    return arg as Record<string, unknown>
  }
  return { args: arg }
}

function buildEntry(
  level: LogLevel,
  args: unknown[],
  base: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    pid: process.pid,
    host: hostname(),
    service: 'xon',
    ...base,
  }

  const [first, ...rest] = args

  if (typeof first === 'string') {
    entry.msg = first
  } else if (first !== undefined) {
    Object.assign(entry, serializeArg(first))
  }

  for (const arg of rest) {
    Object.assign(entry, serializeArg(arg))
  }

  return `${JSON.stringify(entry)}\n`
}

function writeToFile(line: string): void {
  stream?.write(line)
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[currentLevel]
}

// Capture originals before patching so they are always available
const origLog = console.log.bind(console)
const origDebug = console.debug.bind(console)
const origInfo = console.info.bind(console)
const origWarn = console.warn.bind(console)
const origError = console.error.bind(console)

function makeHandler(
  orig: (...a: unknown[]) => void,
  level: LogLevel,
  base: Record<string, unknown> = {},
) {
  return (...args: unknown[]): void => {
    if (!shouldLog(level)) return
    orig(...args)
    writeToFile(buildEntry(level, args, base))
  }
}

/** Update the active log level at runtime (e.g. after loading DB settings). */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

/**
 * Returns a scoped logger that stamps every entry with a `component` field.
 * Uses the pre-patch console originals so output is never double-written to the file.
 */
export function createLogger(component: string): Logger {
  const base = { component }
  return {
    log: makeHandler(origLog, 'info', base),
    debug: makeHandler(origDebug, 'debug', base),
    info: makeHandler(origInfo, 'info', base),
    warn: makeHandler(origWarn, 'warn', base),
    error: makeHandler(origError, 'error', base),
  }
}

/**
 * Initialise the logger. Must be called once at server startup.
 * - Reads LOG_LEVEL env var (overrides the default 'info').
 * - Reads LOG_RETENTION_DAYS env var to control how many daily log files are kept (default 5).
 * - Creates DATA_DIR/logs/ and patches all console methods.
 */
export async function initLogger(dataDir: string): Promise<void> {
  const logsDir = join(dataDir, 'logs')
  await mkdir(logsDir, { recursive: true })

  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  if (envLevel && envLevel in LEVEL_RANK) {
    currentLevel = envLevel
  }

  const retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? 5)

  stream = createStream(
    (time: number | Date | null) => {
      if (!time) return 'current.jsonl'
      const d = time instanceof Date ? time : new Date(time)
      return `${d.toISOString().slice(0, 10)}.jsonl`
    },
    {
      interval: '1d',
      intervalBoundary: true,
      path: logsDir,
      maxFiles: retentionDays,
    },
  )

  stream.on('error', (err) => {
    origError('Logger stream error:', err)
  })

  console.log = makeHandler(origLog, 'info')
  console.debug = makeHandler(origDebug, 'debug')
  console.info = makeHandler(origInfo, 'info')
  console.warn = makeHandler(origWarn, 'warn')
  console.error = makeHandler(origError, 'error')
}
