import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import styles from './AdminHealth.module.css'

interface ScanProgress {
  dataSourceId: string
  totalFiles: number
  processedFiles: number
  currentFile: string | null
}

interface ActiveScan {
  libraryId: string
  startedAt: string
  progress: ScanProgress | null
}

interface LibraryStat {
  id: string
  name: string
  totalItems: number
  lastScanAt: string | null
}

interface HealthData {
  uptime: number
  memory: {
    heapUsed: number
    heapTotal: number
    rss: number
    total: number
    free: number
  }
  cpu: {
    loadAvg1m: number
    loadAvg5m: number
    loadAvg15m: number
  }
  storage: {
    total: number
    free: number
    used: number
  }
  activeScans: ActiveScan[]
  libraries: LibraryStat[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const unit = units[i] ?? 'B'
  return `${(bytes / 1024 ** i).toFixed(1)} ${unit}`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function AdminHealth() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<HealthData | null>(null)

  const fetchHealth = useCallback(() => {
    apiFetch('/api/admin/health')
      .then((r) => r.json() as Promise<HealthData>)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch(() => setError('Failed to load health data'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading) {
    return (
      <div className={styles.page ?? ''}>
        <p className={styles.loading ?? ''}>Loading...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page ?? ''}>
        <p className={styles.error ?? ''}>{error || 'No data'}</p>
      </div>
    )
  }

  const memUsedPct =
    data.memory.total > 0
      ? Math.round(
          ((data.memory.total - data.memory.free) / data.memory.total) * 100,
        )
      : 0
  const diskUsedPct =
    data.storage.total > 0
      ? Math.round((data.storage.used / data.storage.total) * 100)
      : 0

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <h1 className={styles.heading ?? ''}>System Health</h1>
        <button
          type="button"
          className={styles.refreshBtn ?? ''}
          onClick={fetchHealth}
        >
          Refresh
        </button>
      </div>

      <div className={styles.grid ?? ''}>
        {/* Uptime */}
        <section className={styles.card ?? ''}>
          <h2 className={styles.cardHeading ?? ''}>Uptime</h2>
          <p className={styles.stat ?? ''}>{formatUptime(data.uptime)}</p>
        </section>

        {/* Memory */}
        <section className={styles.card ?? ''}>
          <h2 className={styles.cardHeading ?? ''}>Memory</h2>
          <div className={styles.progressBar ?? ''}>
            <div
              className={styles.progressFill ?? ''}
              style={{ width: `${memUsedPct}%` }}
            />
          </div>
          <p className={styles.statDetail ?? ''}>
            {formatBytes(data.memory.total - data.memory.free)} /{' '}
            {formatBytes(data.memory.total)} used ({memUsedPct}%)
          </p>
          <p className={styles.hint ?? ''}>
            Heap: {formatBytes(data.memory.heapUsed)} /{' '}
            {formatBytes(data.memory.heapTotal)}
          </p>
          <p className={styles.hint ?? ''}>
            RSS: {formatBytes(data.memory.rss)}
          </p>
        </section>

        {/* CPU */}
        <section className={styles.card ?? ''}>
          <h2 className={styles.cardHeading ?? ''}>CPU Load</h2>
          <div className={styles.loadRow ?? ''}>
            <span className={styles.loadLabel ?? ''}>1m</span>
            <span className={styles.loadValue ?? ''}>
              {data.cpu.loadAvg1m.toFixed(2)}
            </span>
          </div>
          <div className={styles.loadRow ?? ''}>
            <span className={styles.loadLabel ?? ''}>5m</span>
            <span className={styles.loadValue ?? ''}>
              {data.cpu.loadAvg5m.toFixed(2)}
            </span>
          </div>
          <div className={styles.loadRow ?? ''}>
            <span className={styles.loadLabel ?? ''}>15m</span>
            <span className={styles.loadValue ?? ''}>
              {data.cpu.loadAvg15m.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Storage */}
        <section className={styles.card ?? ''}>
          <h2 className={styles.cardHeading ?? ''}>Storage</h2>
          {data.storage.total > 0 ? (
            <>
              <div className={styles.progressBar ?? ''}>
                <div
                  className={styles.progressFill ?? ''}
                  style={{ width: `${diskUsedPct}%` }}
                />
              </div>
              <p className={styles.statDetail ?? ''}>
                {formatBytes(data.storage.used)} /{' '}
                {formatBytes(data.storage.total)} used ({diskUsedPct}%)
              </p>
              <p className={styles.hint ?? ''}>
                {formatBytes(data.storage.free)} free
              </p>
            </>
          ) : (
            <p className={styles.hint ?? ''}>Storage info unavailable</p>
          )}
        </section>
      </div>

      {/* Active Scans */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>
          Active Scans
          {data.activeScans.length > 0 && (
            <span className={styles.badge ?? ''}>
              {data.activeScans.length}
            </span>
          )}
        </h2>
        {data.activeScans.length === 0 ? (
          <p className={styles.empty ?? ''}>No active scans</p>
        ) : (
          <div className={styles.scanList ?? ''}>
            {data.activeScans.map((scan) => {
              const pct =
                scan.progress && scan.progress.totalFiles > 0
                  ? Math.round(
                      (scan.progress.processedFiles /
                        scan.progress.totalFiles) *
                        100,
                    )
                  : 0
              return (
                <div key={scan.libraryId} className={styles.scanItem ?? ''}>
                  <div className={styles.scanHeader ?? ''}>
                    <span className={styles.scanLibrary ?? ''}>
                      Library: {scan.libraryId}
                    </span>
                    <span className={styles.scanStarted ?? ''}>
                      Started: {formatDate(scan.startedAt)}
                    </span>
                  </div>
                  {scan.progress && (
                    <>
                      <div className={styles.progressBar ?? ''}>
                        <div
                          className={styles.progressFill ?? ''}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={styles.hint ?? ''}>
                        {scan.progress.processedFiles} /{' '}
                        {scan.progress.totalFiles} files ({pct}%)
                        {scan.progress.currentFile &&
                          ` — ${scan.progress.currentFile}`}
                      </p>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Library Statistics */}
      <section className={styles.section ?? ''}>
        <h2 className={styles.sectionHeading ?? ''}>Library Statistics</h2>
        {data.libraries.length === 0 ? (
          <p className={styles.empty ?? ''}>No libraries configured</p>
        ) : (
          <table className={styles.table ?? ''}>
            <thead>
              <tr>
                <th className={styles.th ?? ''}>Library</th>
                <th className={styles.th ?? ''}>Total Items</th>
                <th className={styles.th ?? ''}>Last Scan</th>
              </tr>
            </thead>
            <tbody>
              {data.libraries.map((lib) => (
                <tr key={lib.id}>
                  <td className={styles.td ?? ''}>{lib.name}</td>
                  <td className={styles.td ?? ''}>
                    {lib.totalItems.toLocaleString()}
                  </td>
                  <td className={styles.td ?? ''}>
                    {lib.lastScanAt ? formatDate(lib.lastScanAt) : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
