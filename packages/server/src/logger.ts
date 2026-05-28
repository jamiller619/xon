import { mkdir } from 'node:fs/promises'
import { hostname } from 'node:os'
import { createStream, type RotatingFileStream } from 'rotating-file-stream'
import config from './config.ts'

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

type Mode =
  | { kind: 'file'; stream: RotatingFileStream | null }
  | { kind: 'ipc'; send: (line: string) => void }

let currentLevel: LogLevel = 'info'
let mode: Mode = { kind: 'file', stream: null }

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

function writeLine(line: string): void {
  if (mode.kind === 'file') mode.stream?.write(line)
  else mode.send(line)
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
    writeLine(buildEntry(level, args, base))
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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Initialise the logger for the parent process. Creates the logs directory and
 * opens the rotating file stream. Must be called once at startup.
 *
 * Child processes should call `initChildLogger` instead so they forward log
 * lines to the parent via IPC; otherwise concurrent rotations would race on
 * the same file and lose data.
 */
export async function initLogger(): Promise<void> {
  const logsDir = config.get('appdata.logsPath')

  await mkdir(logsDir, { recursive: true })

  const envLevel = config.get('log.level')

  if (envLevel && envLevel in LEVEL_RANK) {
    currentLevel = envLevel
  }

  const retentionDays = config.get('log.retentionDays')

  const stream = createStream(
    (time: number | Date | null, index?: number) => {
      if (!time) return 'current.jsonl'
      const d = time instanceof Date ? time : new Date(time)
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const suffix = index && index > 1 ? `.${index}` : ''
      return `${date}${suffix}.jsonl`
    },
    {
      interval: '1d',
      intervalBoundary: true,
      initialRotation: true,
      path: logsDir,
      maxFiles: retentionDays,
    },
  )

  stream.on('error', (err) => {
    origError('Logger stream error:', err)
  })

  mode = { kind: 'file', stream }
}

/**
 * Initialise logging for a forked child process. Log lines are forwarded to
 * the parent via IPC; the parent owns the rotating file stream so there is a
 * single writer per file. Falls back to stderr if no IPC channel is present
 * (e.g. running the child entry directly for debugging).
 */
export function initChildLogger(): void {
  const send = process.send?.bind(process)

  if (send) {
    mode = {
      kind: 'ipc',
      send: (line) => {
        send({ type: 'log', line })
      },
    }
  } else {
    mode = {
      kind: 'ipc',
      send: (line) => {
        process.stderr.write(line)
      },
    }
  }
}

/**
 * Accept a pre-serialized log line from a child process and write it to the
 * rotating stream. The child already filtered and formatted; we just append.
 */
export function acceptChildLogLine(line: string): void {
  if (mode.kind === 'file') mode.stream?.write(line)
}

/**
 * Flush and close the rotating stream. Call on graceful shutdown so the final
 * entries reach disk before the process exits.
 */
export async function closeLogger(): Promise<void> {
  if (mode.kind !== 'file') return
  const stream = mode.stream
  mode = { kind: 'file', stream: null }
  if (!stream) return
  await new Promise<void>((resolve) => {
    stream.end(() => resolve())
  })
}
