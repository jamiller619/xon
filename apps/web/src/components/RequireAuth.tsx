import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

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

  useEffect(() => {
    if (tokenValid) return
    setRefreshing(true)
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          navigate('/login', { replace: true })
          return
        }
        const body = (await res.json()) as { accessToken: string }
        const [, payloadB64] = body.accessToken.split('.')
        const payload = JSON.parse(atob(payloadB64 ?? '')) as {
          username: string
          role: string
        }
        setAuth(body.accessToken, payload.username, payload.role)
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setRefreshing(false))
  }, [tokenValid, navigate, setAuth])

  if (refreshing || !tokenValid) return null
  return <>{children}</>
}
