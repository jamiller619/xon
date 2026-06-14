import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import type { LogEntry } from '~/lib/events'
import styles from './ServerOutput.module.css'

/** Maximum lines retained in the view to bound memory. */
const MAX_LINES = 2000
const BACKFILL_LINES = 500

const KNOWN_KEYS = new Set([
  'ts',
  'level',
  'pid',
  'host',
  'service',
  'component',
  'msg',
])

function formatTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString()
}

/** Compact representation of any extra fields beyond the known log keys. */
function extraFields(entry: LogEntry): string {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if (!KNOWN_KEYS.has(key)) extra[key] = value
  }
  return Object.keys(extra).length > 0 ? JSON.stringify(extra) : ''
}

export default function ServerOutput() {
  const [lines, setLines] = useState<LogEntry[]>([])
  const [error, setError] = useState('')
  const pinnedRef = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const append = useCallback((entries: LogEntry[]) => {
    setLines((prev) => {
      const next = [...prev, ...entries]
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
    })
  }, [])

  // Backfill recent history, then stream new lines live.
  useEffect(() => {
    let active = true

    apiFetch(`/api/admin/logs?lines=${BACKFILL_LINES}`)
      .then((r) => r.json() as Promise<{ lines: LogEntry[] }>)
      .then((data) => {
        if (active) setLines(data.lines)
      })
      .catch(() => {
        if (active) setError('Failed to load server logs')
      })

    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === 'log:line') append([event.payload])
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [append])

  // Keep pinned to the bottom as new lines arrive.
  useEffect(() => {
    if (lines.length === 0) return
    if (pinnedRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distanceFromBottom < 24
  }, [])

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <h1 className={styles.heading ?? ''}>Server Output</h1>
        <button
          type="button"
          className={styles.clearBtn ?? ''}
          onClick={() => setLines([])}
        >
          Clear
        </button>
      </div>

      {error && <p className={styles.error ?? ''}>{error}</p>}

      <div
        ref={scrollRef}
        className={styles.terminal ?? ''}
        onScroll={onScroll}
      >
        {lines.length === 0 ? (
          <span className={styles.empty ?? ''}>No output yet…</span>
        ) : (
          lines.map((line, i) => {
            const level = line.level ?? 'info'
            const extra = extraFields(line)
            return (
              <div
                // Log lines have no stable id; index is acceptable for an
                // append-only, capped buffer.
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only buffer
                key={i}
                className={styles.row ?? ''}
                data-level={level}
              >
                <span className={styles.ts ?? ''}>{formatTime(line.ts)}</span>
                <span className={styles.level ?? ''}>
                  {level.toUpperCase()}
                </span>
                {line.component && (
                  <span className={styles.component ?? ''}>
                    {line.component}
                  </span>
                )}
                <span className={styles.msg ?? ''}>
                  {line.msg ?? ''}
                  {extra && (
                    <span className={styles.extra ?? ''}> {extra}</span>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
