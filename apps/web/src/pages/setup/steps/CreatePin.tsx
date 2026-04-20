import { Button, Pin } from '@xon/ui'
import { type FormEvent, useState } from 'react'
import { useAuthStore } from '../../../store/authStore.js'
import type { StepProps } from '../@types'
import styles from '../Setup.module.css'

export default function CreatePin({
  setStep,
  isLoading,
  setLoading,
  hasError,
  setError,
}: StepProps) {
  const [pin, setPin] = useState('')
  const setAuth = useAuthStore((s) => s.setAuth)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        if (res.status === 409) {
          setError('Setup already complete')
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

  return (
    <>
      <h1 className={styles.heading}>Secure Your Server</h1>
      <p className={styles.subtitle}>Set a PIN to protect your server.</p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Pin className={styles.pin} value={pin} onChange={setPin} />
        {hasError && <div className={styles.error}>{hasError}</div>}
        <Button type="submit" disabled={isLoading || pin.length !== 4}>
          Next
        </Button>
        <p>If you don't need to secure this server, you can skip this step.</p>
        <Button disabled={isLoading} onClick={() => setStep(2)}>
          Skip
        </Button>
      </form>
    </>
  )
}
