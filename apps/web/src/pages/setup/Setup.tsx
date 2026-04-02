import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateLibraryForm } from '../../components/create-library-form/CreateLibraryForm.js'
import { useAuthStore } from '../../store/authStore.js'
import styles from './Setup.module.css'

type Step = 1 | 2 | 3

export default function Setup() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const accessToken = useAuthStore((s) => s.accessToken)

  // Step 1 state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Wizard state
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryId, setLibraryId] = useState<string | null>(null)
  const [scanStarted, setScanStarted] = useState(false)

  // Check if setup already complete — redirect to login
  useEffect(() => {
    fetch('/api/v1/auth/setup-status')
      .then((r) => r.json())
      .then((data: { setupComplete: boolean }) => {
        if (data.setupComplete) {
          navigate('/login', { replace: true })
        }
      })
      .catch(() => {})
  }, [navigate])

  async function handleStep1(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        if (res.status === 409) {
          navigate('/login', { replace: true })
          return
        }
        setError(body.error ?? 'Setup failed')
        return
      }
      const body = (await res.json()) as { accessToken: string }
      const [, payloadB64] = body.accessToken.split('.')
      const payload = JSON.parse(atob(payloadB64 ?? '')) as {
        username: string
        role: string
      }
      setAuth(body.accessToken, payload.username, payload.role)
      setStep(2)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleScan() {
    if (!libraryId) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/libraries/${libraryId}/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok && res.status !== 409) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to start scan')
        return
      }
      setScanStarted(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function handleFinish() {
    navigate('/', { replace: true })
  }

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.card ?? ''}>
        <div className={styles.logo ?? ''}>
          <span className={styles.logoText ?? ''}>xon</span>
        </div>
        <div className={styles.steps ?? ''}>
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`${styles.stepDot ?? ''} ${step === s ? (styles.active ?? '') : ''} ${step > s ? (styles.done ?? '') : ''}`}
            >
              {s}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className={styles.heading ?? ''}>Welcome to Xon</h1>
            <p className={styles.subtitle ?? ''}>
              Create your admin account to get started.
            </p>
            <form className={styles.form ?? ''} onSubmit={handleStep1}>
              <div className={styles.field ?? ''}>
                <label htmlFor="displayName" className={styles.label ?? ''}>
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={styles.input ?? ''}
                  required
                />
              </div>
              <div className={styles.field ?? ''}>
                <label htmlFor="username" className={styles.label ?? ''}>
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={styles.input ?? ''}
                  required
                />
              </div>
              <div className={styles.field ?? ''}>
                <label htmlFor="password" className={styles.label ?? ''}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input ?? ''}
                  required
                  minLength={8}
                />
              </div>
              {error && <div className={styles.error ?? ''}>{error}</div>}
              <button
                type="submit"
                className={styles.button ?? ''}
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Create Admin Account'}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className={styles.heading ?? ''}>Create Your First Library</h1>
            <p className={styles.subtitle ?? ''}>
              Set up a media library to organize your content.
            </p>
            <CreateLibraryForm
              onSuccess={(id) => {
                setLibraryId(id)
                setStep(3)
              }}
              onCancel={() => setStep(3)}
              cancelLabel="Skip"
            />
          </>
        )}

        {step === 3 && (
          <>
            <h1 className={styles.heading ?? ''}>
              {scanStarted ? 'Setup Complete!' : 'Scan Your Library'}
            </h1>
            {scanStarted ? (
              <>
                <p className={styles.subtitle ?? ''}>
                  Your library scan is running in the background. Xon is ready
                  to use.
                </p>
                {error && <div className={styles.error ?? ''}>{error}</div>}
                <button
                  type="button"
                  className={styles.button ?? ''}
                  onClick={handleFinish}
                >
                  Go to Dashboard
                </button>
              </>
            ) : (
              <>
                <p className={styles.subtitle ?? ''}>
                  {libraryId
                    ? 'Start an initial scan to index your media files.'
                    : 'Your admin account is ready. You can add libraries and scan media from the admin panel.'}
                </p>
                {error && <div className={styles.error ?? ''}>{error}</div>}
                <div className={styles.buttonRow ?? ''}>
                  <button
                    type="button"
                    className={styles.buttonSecondary ?? ''}
                    onClick={handleFinish}
                  >
                    Skip
                  </button>
                  {libraryId && (
                    <button
                      type="button"
                      className={styles.button ?? ''}
                      disabled={loading}
                      onClick={handleScan}
                    >
                      {loading ? 'Starting scan…' : 'Start Scan'}
                    </button>
                  )}
                  {!libraryId && (
                    <button
                      type="button"
                      className={styles.button ?? ''}
                      onClick={handleFinish}
                    >
                      Go to Dashboard
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
