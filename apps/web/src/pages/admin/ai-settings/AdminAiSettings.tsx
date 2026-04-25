import { useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import styles from './AdminAiSettings.module.css'

type AiMode = 'local-only' | 'cloud-only' | 'local-with-cloud-fallback'

interface AiSettingsData {
  aiEnabled: boolean
  aiMode: AiMode
  cloudApiKeySet: boolean
  cloudApiUrl: string | null
  featureMatching: boolean
  featureTagging: boolean
  featureSimilarity: boolean
  featureSmartGrouping: boolean
}

const DEFAULT_SETTINGS: AiSettingsData = {
  aiEnabled: true,
  aiMode: 'local-only',
  cloudApiKeySet: false,
  cloudApiUrl: null,
  featureMatching: true,
  featureTagging: true,
  featureSimilarity: true,
  featureSmartGrouping: true,
}

export default function AdminAiSettings() {
  const [settings, setSettings] = useState<AiSettingsData>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiMode, setAiMode] = useState<AiMode>('local-only')
  const [cloudApiUrl, setCloudApiUrl] = useState('')
  const [cloudApiKey, setCloudApiKey] = useState('')
  const [featureMatching, setFeatureMatching] = useState(true)
  const [featureTagging, setFeatureTagging] = useState(true)
  const [featureSimilarity, setFeatureSimilarity] = useState(true)
  const [featureSmartGrouping, setFeatureSmartGrouping] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch('/api/v1/admin/ai-settings')
      .then((r) => r.json() as Promise<AiSettingsData>)
      .then((data) => {
        setSettings(data)
        setAiEnabled(data.aiEnabled)
        setAiMode(data.aiMode)
        setCloudApiUrl(data.cloudApiUrl ?? '')
        setFeatureMatching(data.featureMatching)
        setFeatureTagging(data.featureTagging)
        setFeatureSimilarity(data.featureSimilarity)
        setFeatureSmartGrouping(data.featureSmartGrouping)
      })
      .catch(() => setError('Failed to load AI settings'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const body: Record<string, unknown> = {
      aiEnabled,
      aiMode,
      cloudApiUrl: cloudApiUrl || null,
      featureMatching,
      featureTagging,
      featureSimilarity,
      featureSmartGrouping,
    }

    // Only send the API key if the user typed something new
    if (cloudApiKey !== '') {
      body.cloudApiKey = cloudApiKey
    }

    try {
      const res = await apiFetch('/api/v1/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError('Failed to save settings')
      } else {
        const data = (await res.json()) as AiSettingsData
        setSettings(data)
        setCloudApiKey('')
        setSuccess('Settings saved')
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
        <h1 className={styles.heading ?? ''}>AI Configuration</h1>
      </div>

      <form onSubmit={handleSave}>
        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Global</h2>
          <label className={styles.toggle ?? ''}>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            <span>Enable AI features</span>
          </label>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Mode</h2>
          <div className={styles.radioGroup ?? ''}>
            {(
              ['local-only', 'cloud-only', 'local-with-cloud-fallback'] as const
            ).map((mode) => (
              <label key={mode} className={styles.radioOption ?? ''}>
                <input
                  type="radio"
                  name="aiMode"
                  value={mode}
                  checked={aiMode === mode}
                  onChange={() => setAiMode(mode)}
                />
                <span>
                  {mode === 'local-only' && 'Local only'}
                  {mode === 'cloud-only' && 'Cloud only'}
                  {mode === 'local-with-cloud-fallback' &&
                    'Local with cloud fallback'}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Cloud API</h2>
          <div className={styles.fieldGroup ?? ''}>
            <label className={styles.fieldLabel ?? ''}>
              Cloud API URL
              <input
                type="url"
                className={styles.input ?? ''}
                value={cloudApiUrl}
                onChange={(e) => setCloudApiUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className={styles.fieldLabel ?? ''}>
              Cloud API Key
              <input
                type="password"
                className={styles.input ?? ''}
                value={cloudApiKey}
                onChange={(e) => setCloudApiKey(e.target.value)}
                placeholder={
                  settings.cloudApiKeySet
                    ? '••••••••  (leave blank to keep)'
                    : 'Enter API key'
                }
                autoComplete="new-password"
              />
            </label>
            {settings.cloudApiKeySet && cloudApiKey === '' && (
              <p className={styles.keyNote ?? ''}>
                A cloud API key is currently set.
              </p>
            )}
          </div>
        </section>

        <section className={styles.section ?? ''}>
          <h2 className={styles.sectionHeading ?? ''}>Feature Toggles</h2>
          <div className={styles.toggleGroup ?? ''}>
            <label className={styles.toggle ?? ''}>
              <input
                type="checkbox"
                checked={featureMatching}
                onChange={(e) => setFeatureMatching(e.target.checked)}
              />
              <span>AI-assisted media matching</span>
            </label>
            <label className={styles.toggle ?? ''}>
              <input
                type="checkbox"
                checked={featureTagging}
                onChange={(e) => setFeatureTagging(e.target.checked)}
              />
              <span>AI-assisted tagging</span>
            </label>
            <label className={styles.toggle ?? ''}>
              <input
                type="checkbox"
                checked={featureSimilarity}
                onChange={(e) => setFeatureSimilarity(e.target.checked)}
              />
              <span>Visual similarity and duplicate detection</span>
            </label>
            <label className={styles.toggle ?? ''}>
              <input
                type="checkbox"
                checked={featureSmartGrouping}
                onChange={(e) => setFeatureSmartGrouping(e.target.checked)}
              />
              <span>Smart grouping of scattered files</span>
            </label>
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
