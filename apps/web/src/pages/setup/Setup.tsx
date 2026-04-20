import { Flex, Surface } from '@xon/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateLibraryForm } from '../../components/create-library-form/CreateLibraryForm.js'
import Logo from '../../components/logo/Logo.js'
import { useAuthStore } from '../../store/authStore.js'
import styles from './Setup.module.css'
import CreatePin from './steps/CreatePin.js'

export default function Setup() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const accessToken = useAuthStore((s) => s.accessToken)

  // const [username, setUsername] = useState('')
  // const [password, setPassword] = useState('')
  // const [displayName, setDisplayName] = useState('')

  // Wizard state
  const [step, setStep] = useState<number>(1)
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
    <Flex align="center" justify="center" className={styles.page}>
      <Surface className={styles.card}>
        <Flex gap="5" dir="col" align="center" justify="center">
          <div className={styles.logo}>
            <Logo />
          </div>
          <div className={styles.steps}>
            {([1, 2, 3] as number[]).map((s) => (
              <div
                key={s}
                className={`${styles.stepDot} ${step === s ? styles.active : ''} ${step > s ? styles.done : ''}`}
              >
                {s}
              </div>
            ))}
          </div>

          {step === 1 && (
            <CreatePin
              setStep={setStep}
              isLoading={loading}
              setLoading={setLoading}
              hasError={error}
              setError={setError}
            />
          )}

          {step === 2 && (
            <>
              <h1 className={styles.heading}>Create Your First Library</h1>
              <p className={styles.subtitle}>
                Set up a media library to organize your content.
              </p>
              <CreateLibraryForm
                onSuccess={(id) => {
                  setLibraryId(id)
                  setStep(3)
                }}
                onCancel={() => setStep(3)}
                cancelLabel="Skip"
                formClassName={styles.form}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.heading}>
                {scanStarted ? 'Setup Complete!' : 'Scan Your Library'}
              </h1>
              {scanStarted ? (
                <>
                  <p className={styles.subtitle}>
                    Your library scan is running in the background. Xon is ready
                    to use.
                  </p>
                  {error && <div className={styles.error}>{error}</div>}
                  <button
                    type="button"
                    className={styles.button}
                    onClick={handleFinish}
                  >
                    Go to Dashboard
                  </button>
                </>
              ) : (
                <>
                  <p className={styles.subtitle}>
                    {libraryId
                      ? 'Start an initial scan to index your media files.'
                      : 'Your admin account is ready. You can add libraries and scan media from the admin panel.'}
                  </p>
                  {error && <div className={styles.error}>{error}</div>}
                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={handleFinish}
                    >
                      Skip
                    </button>
                    {libraryId && (
                      <button
                        type="button"
                        className={styles.button}
                        disabled={loading}
                        onClick={handleScan}
                      >
                        {loading ? 'Starting scan…' : 'Start Scan'}
                      </button>
                    )}
                    {!libraryId && (
                      <button
                        type="button"
                        className={styles.button}
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
        </Flex>
      </Surface>
    </Flex>
  )
}
