import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useConfig from '~/hooks/useConfig'
import authClient from '~/lib/authClient'

export default function RequireAuth({
  children,
}: {
  children: ReactNode
}): ReactNode {
  const navigate = useNavigate()
  const {
    data,
    error: sessionError,
    isPending,
    isRefetching,
  } = authClient.useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [areAnonLoginsEnabled] = useConfig('session.enableAnonymousLogins')

  const loginAnonymously = useCallback(async () => {
    await authClient.signIn.anonymous({
      fetchOptions: {
        onSuccess() {
          navigate('/', {
            replace: true,
          })
        },
        onError(ctx) {
          setError(ctx.error.message)
        },
        onRequest() {
          setError(null)
          setIsLoading(true)
        },
        onResponse() {
          setIsLoading(false)
        },
      },
    })
  }, [navigate])

  useEffect(() => {
    if (!areAnonLoginsEnabled || isPending || data?.user) return
    loginAnonymously()
  }, [loginAnonymously, areAnonLoginsEnabled, data, isPending])

  const isAuthenticated = !!(!error && data?.user)

  if (isLoading || isPending || isRefetching) return <p>Loading...</p>
  if (error || sessionError) return <p>{error ?? sessionError?.message}</p>
  if (!isAuthenticated) {
    navigate('/login', { replace: true })

    return 'Redirecting...'
  }

  return <>{children}</>
}
