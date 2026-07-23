import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { useEffect } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import type { SortColumn, SortDir } from '../components/libraryControls'

const SCAN_REFRESH_THROTTLE_MS = 3000
const PAGE_SIZE = 40

type LibraryMediaOptions = {
  libraryId: string | undefined
  sortCol: SortColumn
  sortDir: SortDir
  mediaType: string
  unmatchedOnly: boolean
}

type LibraryMediaResult = {
  items: MediaItem[]
  total: number
}

export function useLibraryMedia(options: LibraryMediaOptions) {
  const { libraryId, sortCol, sortDir, mediaType, unmatchedOnly } = options
  const queryClient = useQueryClient()
  const queryKey = [
    'library-media',
    libraryId,
    { sortCol, sortDir, mediaType, unmatchedOnly },
  ] as const

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!libraryId,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<LibraryMediaResult> => {
      const params = new URLSearchParams({
        order: sortDir,
        sortBy: sortCol,
        limit: String(PAGE_SIZE),
        page: String(pageParam),
      })
      if (mediaType) params.set('mediaType', mediaType)
      if (unmatchedOnly) params.set('unmatched', 'true')

      const response = await apiFetch(
        `/api/libraries/${libraryId}/media?${params.toString()}`,
        { signal },
      )
      if (!response.ok) throw new Error('Failed to load media')

      const items = (await response.json()) as MediaItem[]
      const totalHeader = response.headers.get('X-Total-Count')
      const total = totalHeader == null ? Number.NaN : Number(totalHeader)
      return { items, total: Number.isFinite(total) ? total : items.length }
    },
    getNextPageParam: (lastPage, pages, lastPageParam) => {
      const loadedCount = pages.reduce(
        (count, page) => count + page.items.length,
        0,
      )
      return loadedCount < lastPage.total && lastPage.items.length > 0
        ? lastPageParam + 1
        : undefined
    },
  })

  useEffect(() => {
    if (!libraryId) return
    let lastRefresh = 0

    return subscribeToEvents((event) => {
      if (
        event.type !== 'scan:progress' &&
        event.type !== 'scan:complete' &&
        event.type !== 'scan:error'
      )
        return
      if (event.payload.libraryId !== libraryId) return
      if (
        event.type === 'scan:progress' &&
        event.payload.phase === 'discovering'
      )
        return

      const now = Date.now()
      if (
        event.type === 'scan:progress' &&
        now - lastRefresh < SCAN_REFRESH_THROTTLE_MS
      )
        return

      lastRefresh = now
      void queryClient.invalidateQueries({
        queryKey: ['library-media', libraryId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['library-stats', libraryId],
      })
    })
  }, [libraryId, queryClient])

  return query
}
