import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { useEffect } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import type { SortDirection } from '../../types/collectionView'
import type { MovieSortKey } from './movieControls'

const SCAN_REFRESH_THROTTLE_MS = 3000
const PAGE_SIZE = 40

type MovieLibraryMediaOptions = {
  libraryId: string
  sortKey: MovieSortKey
  sortDirection: SortDirection
  mediaType: string
  unmatchedOnly: boolean
}

export type MovieMediaSource =
  | { kind: 'library'; id: string }
  | { kind: 'collection'; id: string }

type MovieMediaOptions = Omit<MovieLibraryMediaOptions, 'libraryId'> & {
  source: MovieMediaSource
  sortKey: MovieSortKey | 'sortOrder'
}

type MovieLibraryMediaResult = {
  items: MediaItem[]
  total: number
}

export function useMovieMedia(options: MovieMediaOptions) {
  const { source, sortKey, sortDirection, mediaType, unmatchedOnly } = options
  const queryClient = useQueryClient()
  const queryKey = [
    `${source.kind}-media`,
    source.id,
    { sortKey, sortDirection, mediaType, unmatchedOnly },
  ] as const

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<MovieLibraryMediaResult> => {
      const params = new URLSearchParams({
        order: sortDirection,
        sortBy: sortKey,
        limit: String(PAGE_SIZE),
        page: String(pageParam),
      })
      if (mediaType) params.set('mediaType', mediaType)
      if (unmatchedOnly) params.set('unmatched', 'true')

      const mediaPath =
        source.kind === 'library'
          ? `/api/libraries/${source.id}/media`
          : `/api/collections/${source.id}/media`
      const response = await apiFetch(`${mediaPath}?${params.toString()}`, {
        signal,
      })
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
    let lastRefresh = 0

    return subscribeToEvents((event) => {
      if (
        event.type !== 'scan:progress' &&
        event.type !== 'scan:complete' &&
        event.type !== 'scan:error'
      )
        return
      if (source.kind === 'library' && event.payload.libraryId !== source.id)
        return
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
        queryKey: [`${source.kind}-media`, source.id],
      })
      if (source.kind === 'library') {
        void queryClient.invalidateQueries({
          queryKey: ['library-stats', source.id],
        })
      }
    })
  }, [queryClient, source.id, source.kind])

  return query
}

export function useMovieLibraryMedia(options: MovieLibraryMediaOptions) {
  const { libraryId, ...mediaOptions } = options
  return useMovieMedia({
    ...mediaOptions,
    source: { kind: 'library', id: libraryId },
  })
}
