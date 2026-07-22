import { MediaType } from '@xon/shared'
import { useSearchParams } from 'react-router-dom'

export type SortColumn = 'title' | 'fileSize' | 'createdAt'
export type SortDir = 'asc' | 'desc'

export const SORT_OPTIONS: ReadonlyArray<{
  label: string
  col: SortColumn
  dir: SortDir
}> = [
  { label: 'Date Added (newest)', col: 'createdAt', dir: 'desc' },
  { label: 'Date Added (oldest)', col: 'createdAt', dir: 'asc' },
  { label: 'Title A→Z', col: 'title', dir: 'asc' },
  { label: 'Title Z→A', col: 'title', dir: 'desc' },
  { label: 'File Size (largest)', col: 'fileSize', dir: 'desc' },
  { label: 'File Size (smallest)', col: 'fileSize', dir: 'asc' },
]

const SORT_COLUMNS = new Set<SortColumn>(['title', 'fileSize', 'createdAt'])
const MEDIA_TYPES = new Set<MediaType.MainType>(
  Object.values(MediaType.MainType),
)

export function useLibraryControls() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSortCol = searchParams.get('sort')
  const rawSortDir = searchParams.get('order')
  const rawPage = Number(searchParams.get('page'))
  const rawMediaType = searchParams.get('type')

  const sortCol = SORT_COLUMNS.has(rawSortCol as SortColumn)
    ? (rawSortCol as SortColumn)
    : 'createdAt'
  const sortDir: SortDir = rawSortDir === 'asc' ? 'asc' : 'desc'
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const mediaType = MEDIA_TYPES.has(rawMediaType as MediaType.MainType)
    ? (rawMediaType as MediaType.MainType)
    : ''

  function updateParams(update: (next: URLSearchParams) => void) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      update(next)
      return next
    })
  }

  function setPage(nextPage: number | ((page: number) => number)) {
    const value = typeof nextPage === 'function' ? nextPage(page) : nextPage
    updateParams((next) => {
      if (value > 1) next.set('page', String(value))
      else next.delete('page')
    })
  }

  function setSort(col: SortColumn, dir: SortDir) {
    updateParams((next) => {
      if (col === 'createdAt') next.delete('sort')
      else next.set('sort', col)
      if (dir === 'desc') next.delete('order')
      else next.set('order', dir)
      next.delete('page')
    })
  }

  function handleSort(col: SortColumn) {
    setSort(col, col === sortCol && sortDir === 'asc' ? 'desc' : 'asc')
  }

  function handleSortOption(value: string) {
    const option = SORT_OPTIONS.find(
      ({ col, dir }) => makeSortKey(col, dir) === value,
    )
    if (option) setSort(option.col, option.dir)
  }

  function setMediaType(value: string) {
    updateParams((next) => {
      if (MEDIA_TYPES.has(value as MediaType.MainType)) next.set('type', value)
      else next.delete('type')
      next.delete('page')
    })
  }

  return {
    sortCol,
    sortDir,
    page,
    mediaType,
    currentSortKey: makeSortKey(sortCol, sortDir),
    setPage,
    handleSort,
    handleSortOption,
    setMediaType,
  }
}

export function makeSortKey(col: SortColumn, dir: SortDir): string {
  return `${col}:${dir}`
}
