import { MediaType } from '@xon/shared'
import { useSearchParams } from 'react-router-dom'
import { useLibrarySort } from '../../hooks/useLibrarySort'
import type { SortOption, SortValue } from '../../types/collectionView'

export type MovieSortKey = 'sortOrder' | 'title' | 'fileSize' | 'createdAt'

export const MOVIE_SORT_OPTIONS = [
  { label: 'Title A→Z', key: 'title', direction: 'asc' },
  { label: 'Title Z→A', key: 'title', direction: 'desc' },
  { label: 'Date Added (newest)', key: 'createdAt', direction: 'desc' },
  { label: 'Date Added (oldest)', key: 'createdAt', direction: 'asc' },
  { label: 'File Size (largest)', key: 'fileSize', direction: 'desc' },
  { label: 'File Size (smallest)', key: 'fileSize', direction: 'asc' },
] as const satisfies readonly SortOption<MovieSortKey>[]

export const DEFAULT_MOVIE_SORT = {
  key: 'title',
  direction: 'asc',
} as const satisfies SortValue<MovieSortKey>

const MEDIA_TYPES = new Set<MediaType.MainType>(
  Object.values(MediaType.MainType),
)

export function useMovieControls(
  sortOptions: readonly SortOption<MovieSortKey>[],
  defaultSort: SortValue<MovieSortKey>,
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sort = useLibrarySort(sortOptions, defaultSort)
  const rawMediaType = searchParams.get('type')
  const mediaType = MEDIA_TYPES.has(rawMediaType as MediaType.MainType)
    ? (rawMediaType as MediaType.MainType)
    : ''
  const unmatchedOnly = searchParams.get('unmatched') === 'true'

  function updateParams(update: (next: URLSearchParams) => void) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      update(next)
      return next
    })
  }

  function setMediaType(value: string) {
    updateParams((next) => {
      if (MEDIA_TYPES.has(value as MediaType.MainType)) next.set('type', value)
      else next.delete('type')
      next.delete('page')
    })
  }

  function setUnmatchedOnly(value: boolean) {
    updateParams((next) => {
      if (value) next.set('unmatched', 'true')
      else next.delete('unmatched')
      next.delete('page')
    })
  }

  return {
    ...sort,
    mediaType,
    unmatchedOnly,
    setMediaType,
    setUnmatchedOnly,
  }
}
