import { Select } from '@xon/ui'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import type { LogEntry } from '~/lib/events'
import styles from './LogViewer.module.css'

const FETCH_LINES = 5000

interface LogFile {
  name: string
  size: number
  mtime: string
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const unit = units[i] ?? 'B'
  return `${(bytes / 1024 ** i).toFixed(1)} ${unit}`
}

function formatTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export default function LogViewer() {
  const [files, setFiles] = useState<LogFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [level, setLevel] = useState('')
  const [component, setComponent] = useState('')
  const [search, setSearch] = useState('')
  // The expanded entry is tracked by reference — entries are stable per file
  // load, so identity survives filtering.
  const [expanded, setExpanded] = useState<LogEntry | null>(null)

  // Load the file list once; select the newest file by default.
  useEffect(() => {
    let active = true

    apiFetch('/api/admin/logs/files')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ files: LogFile[] }>
      })
      .then((data) => {
        if (!active) return
        setFiles(data.files)
        const first = data.files[0]
        if (first) setSelectedFile(first.name)
        else setLoading(false)
      })
      .catch(() => {
        if (active) {
          setError('Failed to load log files')
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  // Load entries whenever the selected file changes.
  useEffect(() => {
    if (!selectedFile) return

    let active = true
    setLoading(true)
    setExpanded(null)

    apiFetch(`/api/admin/logs/files/${selectedFile}?lines=${FETCH_LINES}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ lines: LogEntry[] }>
      })
      .then((data) => {
        if (!active) return
        // Newest entries first for browsing.
        setEntries(data.lines.toReversed())
        setError('')
      })
      .catch(() => {
        if (active) setError('Failed to load log entries')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedFile])

  const components = useMemo(() => {
    const set = new Set<string>()
    for (const entry of entries) {
      if (entry.component) set.add(entry.component)
    }
    return [...set].sort()
  }, [entries])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (level && entry.level !== level) return false
      if (component && entry.component !== component) return false
      if (query && !JSON.stringify(entry).toLowerCase().includes(query)) {
        return false
      }
      return true
    })
  }, [entries, level, component, search])

  const selectedFileInfo = files.find((f) => f.name === selectedFile)

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <h1 className={styles.heading ?? ''}>Log Viewer</h1>
        {selectedFileInfo && (
          <span className={styles.fileInfo ?? ''}>
            {formatBytes(selectedFileInfo.size)} —{' '}
            {formatTime(selectedFileInfo.mtime)}
          </span>
        )}
      </div>

      <div className={styles.toolbar ?? ''}>
        <Select
          size="small"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
          aria-label="Log file"
        >
          {files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.name}
            </option>
          ))}
        </Select>

        <Select
          size="small"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          aria-label="Level filter"
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>

        <Select
          size="small"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
          aria-label="Component filter"
        >
          <option value="">All components</option>
          {components.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>

        <input
          type="search"
          className={styles.search ?? ''}
          placeholder="Search entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <span className={styles.count ?? ''}>
          {filtered.length.toLocaleString()} of{' '}
          {entries.length.toLocaleString()} entries
        </span>
      </div>

      {error && <p className={styles.error ?? ''}>{error}</p>}

      <div className={styles.list ?? ''}>
        {loading ? (
          <span className={styles.empty ?? ''}>Loading…</span>
        ) : filtered.length === 0 ? (
          <span className={styles.empty ?? ''}>
            {files.length === 0 ? 'No log files found' : 'No matching entries'}
          </span>
        ) : (
          filtered.map((entry, i) => {
            const entryLevel = entry.level ?? 'info'
            const isExpanded = expanded === entry
            return (
              <div
                // Entries have no stable id; the list is immutable per file
                // load so an index key is safe.
                // biome-ignore lint/suspicious/noArrayIndexKey: immutable per-file snapshot
                key={i}
                className={styles.entry ?? ''}
                data-level={entryLevel}
              >
                <button
                  type="button"
                  className={styles.row ?? ''}
                  onClick={() => setExpanded(isExpanded ? null : entry)}
                  aria-expanded={isExpanded}
                >
                  <span className={styles.ts ?? ''}>
                    {formatTime(entry.ts)}
                  </span>
                  <span className={styles.level ?? ''}>
                    {entryLevel.toUpperCase()}
                  </span>
                  {entry.component && (
                    <span className={styles.component ?? ''}>
                      {entry.component}
                    </span>
                  )}
                  <span className={styles.msg ?? ''}>{entry.msg ?? ''}</span>
                </button>
                {isExpanded && (
                  <pre className={styles.detail ?? ''}>
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
