import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { useDebounceValue } from 'usehooks-ts'
import { apiFetch } from '~/lib/apiFetch'

const DEBOUNCE_MS = 250
const GENRE_LIMIT = 5

export const SEARCH_RESULT_LIMIT = 6

export type SearchStatus = 'idle' | 'loading' | 'error' | 'success'

interface UseSearchDialogDataOptions {
  initialGenres: string[]
  initialQuery: string
  initialResults: MediaItem[]
  open: boolean
  preview: boolean
  query: string
}

export function useSearchDialogData({
  initialGenres,
  initialQuery,
  initialResults,
  open,
  preview,
  query,
}: UseSearchDialogDataOptions) {
  const normalizedQuery = query.trim()
  const [debouncedQuery] = useDebounceValue(normalizedQuery, DEBOUNCE_MS)
  const queriesEnabled = open && !preview

  const genresQuery = useQuery({
    queryKey: ['search', 'genres', GENRE_LIMIT] as const,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(
        `/api/search/genres?limit=${GENRE_LIMIT}`,
        { signal },
      )
      if (!response.ok) throw new Error('Popular genres request failed')

      return parseGenres(await response.json())
    },
    enabled: queriesEnabled,
    initialData:
      !preview && initialGenres.length > 0 ? initialGenres : undefined,
  })

  const topResultsQuery = useQuery({
    queryKey: ['featuredMedia'] as const,
    queryFn: async ({ signal }) => {
      const response = await apiFetch('/api/media/featured', { signal })
      if (!response.ok) throw new Error('Top results request failed')

      const data: unknown = await response.json()
      return Array.isArray(data) ? (data as MediaItem[]) : []
    },
    select: (results) => results?.slice(0, SEARCH_RESULT_LIMIT) ?? [],
    enabled: queriesEnabled && !normalizedQuery,
    initialData:
      !preview && !initialQuery.trim() && initialResults.length > 0
        ? initialResults
        : undefined,
  })

  const searchResultsQuery = useQuery({
    queryKey: [
      'search',
      'results',
      debouncedQuery,
      1,
      SEARCH_RESULT_LIMIT,
    ] as const,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}&page=1&limit=${SEARCH_RESULT_LIMIT}`,
        { signal },
      )
      if (!response.ok) throw new Error('Search request failed')

      const data: unknown = await response.json()
      return Array.isArray(data) ? (data as MediaItem[]) : []
    },
    enabled:
      queriesEnabled &&
      Boolean(normalizedQuery) &&
      debouncedQuery === normalizedQuery,
    initialData:
      !preview &&
      debouncedQuery === initialQuery.trim() &&
      initialResults.length > 0
        ? initialResults
        : undefined,
  })

  const popularGenres = preview ? initialGenres : (genresQuery.data ?? [])
  const genresStatus = preview
    ? initialGenres.length > 0
      ? 'success'
      : 'idle'
    : getQueryStatus({
        enabled: queriesEnabled,
        hasData: genresQuery.data !== undefined,
        isError: genresQuery.isError,
        isPending: genresQuery.isPending,
      })
  const isWaitingForDebounce = normalizedQuery !== debouncedQuery
  const suggestions = preview
    ? initialResults
    : normalizedQuery
      ? isWaitingForDebounce
        ? []
        : (searchResultsQuery.data ?? [])
      : (topResultsQuery.data ?? [])
  const status: SearchStatus = preview
    ? initialResults.length > 0
      ? 'success'
      : 'idle'
    : isWaitingForDebounce
      ? 'loading'
      : getQueryStatus({
          enabled: queriesEnabled,
          hasData: normalizedQuery
            ? searchResultsQuery.data !== undefined
            : topResultsQuery.data !== undefined,
          isError: normalizedQuery
            ? searchResultsQuery.isError
            : topResultsQuery.isError,
          isPending: normalizedQuery
            ? searchResultsQuery.isPending
            : topResultsQuery.isPending,
        })

  return { genresStatus, popularGenres, status, suggestions }
}

type QueryStatusInput = {
  enabled: boolean
  hasData: boolean
  isError: boolean
  isPending: boolean
}

function getQueryStatus({
  enabled,
  hasData,
  isError,
  isPending,
}: QueryStatusInput): SearchStatus {
  if (hasData) return 'success'
  if (!enabled) return 'idle'
  if (isError) return 'error'
  if (isPending) return 'loading'
  return 'success'
}

function parseGenres(data: unknown): string[] {
  if (!Array.isArray(data)) return []

  return data.flatMap((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'name' in item &&
      typeof item.name === 'string'
    ) {
      return [item.name]
    }
    return []
  })
}
