import type { Library } from '@xon/shared'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'

export default function useLibraries() {
  const [libraries, setLibraries] = useState<Library[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLibraries = useCallback(async () => {
    setIsLoading(true)

    try {
      const res = await apiFetch('/api/v1/libraries')
      const data = (await res.json()) as Library[]
      setLibraries(data)
    } catch {
      setError('Failed to load libraries')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLibraries()
  }, [fetchLibraries])

  return {
    libraries,
    isLoading,
    error,
    fetchLibraries,
  }
}
