import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import type { MatchProviderResults } from './types'

export function useMetadataMatchSearch(mediaId: string) {
  const [results, setResults] = useState<MatchProviderResults[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string>()
  const request = useRef<AbortController>(undefined)

  useEffect(() => () => request.current?.abort(), [])

  const search = useCallback(
    async (query: string) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setIsSearching(true)
      setError(undefined)

      const params = new URLSearchParams({ query })

      try {
        const response = await apiFetch(
          `/api/media/${mediaId}/matches?${params}`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error(await getAPIError(response, 'Metadata search failed'))
        }
        const body = (await response.json()) as {
          providers: MatchProviderResults[]
        }
        setResults(body.providers)
      } catch (searchError) {
        if (controller.signal.aborted) return
        setError(
          searchError instanceof Error ? searchError.message : 'Search failed',
        )
      } finally {
        if (request.current === controller) setIsSearching(false)
      }
    },
    [mediaId],
  )

  return { results, isSearching, error, search }
}
