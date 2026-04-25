import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '~/store/authStore'

function isTokenExpired(token: string): boolean {
  try {
    const [, payloadB64] = token.split('.')
    const payload = JSON.parse(atob(payloadB64 ?? '')) as { exp?: number }
    return typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp
  } catch {
    return true
  }
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  const tokenValid = accessToken !== null && !isTokenExpired(accessToken)
  const [refreshing, setRefreshing] = useState(!tokenValid)
  const [authFree, setAuthFree] = useState(false)

  useEffect(() => {
    if (tokenValid) {
      setRefreshing(false)
      return
    }
    setRefreshing(true)
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const body = (await res.json()) as { accessToken: string }
          const [, payloadB64] = body.accessToken.split('.')
          const payload = JSON.parse(atob(payloadB64 ?? '')) as {
            username: string
            role: string
          }
          setAuth(body.accessToken, payload.username, payload.role)
          return
        }
        // Refresh failed — check whether auth is even required
        try {
          const statusRes = await fetch('/api/v1/auth/setup-status')
          const { setupComplete } = (await statusRes.json()) as {
            setupComplete: boolean
          }
          if (!setupComplete) {
            // No users exist: app is running in open-access mode
            setAuthFree(true)
          } else {
            navigate('/login', { replace: true })
          }
        } catch {
          navigate('/login', { replace: true })
        }
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setRefreshing(false))
  }, [tokenValid, navigate, setAuth])

  if (authFree) return <>{children}</>
  if (refreshing || !tokenValid) return null
  return <>{children}</>
}
