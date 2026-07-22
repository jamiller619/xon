import { useState } from 'react'

export type SortColumn =
  | 'title'
  | 'fileSize'
  | 'createdAt'
  | 'releaseDate'
  | 'rating'
  | 'duration'

export type SortDir = 'asc' | 'desc'

export const SORT_OPTIONS: { label: string; col: SortColumn; dir: SortDir }[] =
  [
    { label: 'Date Added (newest)', col: 'createdAt', dir: 'desc' },
    { label: 'Date Added (oldest)', col: 'createdAt', dir: 'asc' },
    { label: 'Title A→Z', col: 'title', dir: 'asc' },
    { label: 'Title Z→A', col: 'title', dir: 'desc' },
    { label: 'File Size (largest)', col: 'fileSize', dir: 'desc' },
    { label: 'File Size (smallest)', col: 'fileSize', dir: 'asc' },
    { label: 'Release Date (newest)', col: 'releaseDate', dir: 'desc' },
    { label: 'Rating (highest)', col: 'rating', dir: 'desc' },
  ]

export function useFilters() {
  const [sortCol, setSortCol] = useState<SortColumn>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const currentSortKey = makeSortKey(sortCol, sortDir)

  function handleSortOption(value: string) {
    const opt = SORT_OPTIONS.find((o) => makeSortKey(o.col, o.dir) === value)
    if (opt) {
      setSortCol(opt.col)
      setSortDir(opt.dir)
      setPage(1)
    }
  }

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  return {
    sortDir,
    sortCol,
    page,
    setPage,
    handleSort,
    handleSortOption,
    currentSortKey,
  }
}

export function makeSortKey(col: SortColumn, dir: SortDir): string {
  return `${col}:${dir}`
}
