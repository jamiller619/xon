import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../apiFetch.js'
import styles from './AdminSettings.module.css'

type ThumbnailSize = 'small' | 'medium' | 'large' | 'xlarge'

interface ServerConfigData {
  serverPort: number
  dataDirectory: string
  defaultScanSchedule: string | null
  thumbnailSizes: ThumbnailSize[]
  requiresRestart: boolean
}

const THUMBNAIL_SIZE_OPTIONS: ThumbnailSize[] = [
  'small',
  'medium',
  'large',
  'xlarge',
]

const DEFAULT_CONFIG: ServerConfigData = {
  serverPort: 32400,
  dataDirectory: './data',
  defaultScanSchedule: null,
  thumbnailSizes: ['small', 'medium'],
  requiresRestart: false,
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [restartNotice, setRestartNotice] = useState(false)

  const [serverPort, setServerPort] = useState(32400)
  const [dataDirectory, setDataDirectory] = useState('./data')
  const [defaultScanSchedule, setDefaultScanSchedule] = useState('')
  const [thumbnailSizes, setThumbnailSizes] = useState<ThumbnailSize[]>([
    'small',
    'medium',
  ])

  const applyConfig = useCallback((data: ServerConfigData) => {
    setServerPort(data.serverPort)
    setDataDirectory(data.dataDirectory)
    setDefaultScanSchedule(data.defaultScanSchedule ?? '')
    setThumbnailSizes(data.thumbnailSizes)
  }, [])

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/v1/admin/settings')
      .then((r) => r.json() as Promise<ServerConfigData>)
      .then((data) => {
        applyConfig(data)
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [applyConfig])

  function toggleThumbnailSize(size: ThumbnailSize) {
    setThumbnailSizes((prev) => {
      if (prev.includes(size)) {
        if (prev.length === 1) return prev // keep at least one
        return prev.filter((s) => s !== size)
      }
      return [...prev, size]
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    setRestartNotice(false)

    try {
      const res = await apiFetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverPort,
          dataDirectory,
          defaultScanSchedule: defaultScanSchedule || null,
          thumbnailSizes,
        }),
      })
      if (!res.ok) {
        setError('Failed to save settings')
      } else {
        const data = (await res.json()) as ServerConfigData
        applyConfig(data)
        setSuccess('Settings saved')
        if (data.requiresRestart) setRestartNotice(true)
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page ?? ''}>
        <p className={styles.loading ?? ''}>Loading...</p>
      </div>
    )
  }

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <h1 className={styles.heading ?? ''}>Server Configuration</h1>
      </div>

      {restartNotice && (
        <div className={styles.restartBanner ?? ''}>
          Some changes require a server restart to take effect.
        </div>
      )}

      <form onSubmit={handleSave}>
        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>
            Network
            <span className={styles.restartTag ?? ''}>requires restart</span>
          </h2>
          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''}>
              Server Port
              <input
                type="number"
                className={styles.input ?? ''}
                value={serverPort}
                min={1}
                max={65535}
                onChange={(e) => setServerPort(Number(e.target.value))}
              />
              <span className={styles.hint ?? ''}>
                Default: 32400. Requires restart.
              </span>
            </label>
          </div>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>
            Storage
            <span className={styles.restartTag ?? ''}>requires restart</span>
          </h2>
          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''}>
              Data Directory
              <input
                type="text"
                className={styles.input ?? ''}
                value={dataDirectory}
                onChange={(e) => setDataDirectory(e.target.value)}
                placeholder="./data"
              />
              <span className={styles.hint ?? ''}>
                Path where the database and media metadata are stored. Requires
                restart.
              </span>
            </label>
          </div>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Scanning</h2>
          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''}>
              Default Scan Schedule (cron)
              <input
                type="text"
                className={styles.input ?? ''}
                value={defaultScanSchedule}
                onChange={(e) => setDefaultScanSchedule(e.target.value)}
                placeholder="0 2 * * * (daily at 2 AM)"
              />
              <span className={styles.hint ?? ''}>
                Cron expression for automatic library scans. Leave blank to
                disable.
              </span>
            </label>
          </div>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Thumbnails</h2>
          <p className={styles.sectionDesc ?? ''}>
            Select which thumbnail sizes are generated during scans.
          </p>
          <div className={styles.checkboxGroup ?? ''}>
            {THUMBNAIL_SIZE_OPTIONS.map((size) => (
              <label key={size} className={styles.checkbox ?? ''}>
                <input
                  type="checkbox"
                  checked={thumbnailSizes.includes(size)}
                  onChange={() => toggleThumbnailSize(size)}
                />
                <span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
              </label>
            ))}
          </div>
        </section>

        {error && <p className={styles.error ?? ''}>{error}</p>}
        {success && <p className={styles.success ?? ''}>{success}</p>}

        <div className={styles.actions ?? ''}>
          <button
            type="submit"
            className={styles.saveBtn ?? ''}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
