import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useConfig from '~/hooks/useConfig'
import authClient from '~/lib/authClient'

/**
 * In-flight anonymous sign-in, shared across callers: React StrictMode
 * re-runs the sign-in effect, and firing the request twice both creates a
 * duplicate anonymous user and makes the losing request fail with a 400.
 */
let anonSignIn: ReturnType<typeof authClient.signIn.anonymous> | null = null

function signInAnonymouslyOnce() {
  anonSignIn ??= authClient.signIn.anonymous().finally(() => {
    anonSignIn = null
  })

  return anonSignIn
}

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
    refetch,
  } = authClient.useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAttemptedSignIn = useRef(false)
  const [areAnonLoginsEnabled] = useConfig('session.enableAnonymousLogins')

  const loginAnonymously = useCallback(async () => {
    setError(null)
    setIsLoading(true)

    const { error: signInError } = await signInAnonymouslyOnce()

    setIsLoading(false)

    if (signInError) {
      setError(signInError.message ?? 'Anonymous sign-in failed')
      return
    }

    // Pick up the new session cookie; children render in place, preserving
    // whatever URL the user originally requested
    refetch()
  }, [refetch])

  useEffect(() => {
    if (
      !areAnonLoginsEnabled ||
      hasAttemptedSignIn.current ||
      isPending ||
      isRefetching ||
      data?.user != null
    )
      return

    hasAttemptedSignIn.current = true
    loginAnonymously()
  }, [areAnonLoginsEnabled, data, isPending, isRefetching, loginAnonymously])

  useEffect(() => {
    if (isPending || isRefetching || isLoading) return

    const isAuthenticated = !!(!sessionError && data?.user)

    if (isAuthenticated) return

    // Anon logins are enabled and haven't failed yet — wait for the sign-in
    if (areAnonLoginsEnabled && !error && !sessionError) return

    navigate('/login', { replace: true })
  }, [
    data,
    error,
    sessionError,
    isPending,
    isRefetching,
    isLoading,
    areAnonLoginsEnabled,
    navigate,
  ])

  if (data?.user == null && (isLoading || isPending || isRefetching))
    return <p>Loading...</p>
  if (error || sessionError) return <p>{error ?? sessionError?.message}</p>

  return <>{children}</>
}
