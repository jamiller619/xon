import { type ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/index.js'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const navigate = useNavigate()

  useEffect(() => {
    if (!accessToken) {
      navigate('/login', { replace: true })
    }
  }, [accessToken, navigate])

  if (!accessToken) return null

  return <>{children}</>
}
