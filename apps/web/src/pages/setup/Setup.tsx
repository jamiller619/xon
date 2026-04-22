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

  // const [username, setUsername] = useState('')
  // const [password, setPassword] = useState('')
  // const [displayName, setDisplayName] = useState('')

  // Wizard state
  const [step, setStep] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Flex align="center" justify="center" className={styles.page}>
      <Surface className={styles.card}>
        <Flex gap="5" dir="col" align="center" justify="center">
          <div className={styles.logo}>
            <Logo />
          </div>
          <div className={styles.steps}>
            {([1, 2] as number[]).map((s) => (
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
                onSuccess={() => navigate('/', { replace: true })}
                formClassName={styles.form}
              />
            </>
          )}

        </Flex>
      </Surface>
    </Flex>
  )
}
