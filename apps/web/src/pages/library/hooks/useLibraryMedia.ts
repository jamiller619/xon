import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { useEffect } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import type { SortColumn, SortDir } from '../components/libraryControls'

const SCAN_REFRESH_THROTTLE_MS = 3000

type LibraryMediaOptions = {
  libraryId: string | undefined
  page: number
  pageSize: number
  sortCol: SortColumn
  sortDir: SortDir
  mediaType: string
}

type LibraryMediaResult = {
  items: MediaItem[]
  total: number
}

export function useLibraryMedia(options: LibraryMediaOptions) {
  const { libraryId, page, pageSize, sortCol, sortDir, mediaType } = options
  const queryClient = useQueryClient()
  const queryKey = [
    'library-media',
    libraryId,
    { page, pageSize, sortCol, sortDir, mediaType },
  ] as const

  const query = useQuery<LibraryMediaResult>({
    queryKey,
    enabled: !!libraryId,
    placeholderData: (previous) => previous,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        order: sortDir,
        sortBy: sortCol,
        limit: String(pageSize),
        page: String(page),
      })
      if (mediaType) params.set('mediaType', mediaType)

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
    })
  }, [libraryId, queryClient])

  return query
}
