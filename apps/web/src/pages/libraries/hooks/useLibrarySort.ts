import { useSearchParams } from 'react-router-dom'
import type {
  SortDirection,
  SortOption,
  SortValue,
} from '../types/collectionView'

export function makeSortKey<SortKey extends string>(
  value: SortValue<SortKey>,
): string {
  return `${value.key}:${value.direction}`
}

export function useLibrarySort<SortKey extends string>(
  options: readonly SortOption<SortKey>[],
  defaultSort: SortValue<SortKey>,
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawKey = searchParams.get('sort') ?? defaultSort.key
  const rawDirection: SortDirection =
    searchParams.get('order') === 'desc' ? 'desc' : 'asc'
  const selected = options.find(
    (option) => option.key === rawKey && option.direction === rawDirection,
  )
  const sort = selected ?? defaultSort

  function setSort(value: SortValue<SortKey>) {
    const supported = options.some(
      (option) =>
        option.key === value.key && option.direction === value.direction,
    )
    const nextSort = supported ? value : defaultSort

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (nextSort.key === defaultSort.key) next.delete('sort')
      else next.set('sort', nextSort.key)
      if (nextSort.direction === defaultSort.direction) next.delete('order')
      else next.set('order', nextSort.direction)
      next.delete('page')
      return next
    })
  }

  function handleSort(key: SortKey) {
    const desiredDirection: SortDirection =
      key === sort.key && sort.direction === 'asc' ? 'desc' : 'asc'
    const next =
      options.find(
        (option) => option.key === key && option.direction === desiredDirection,
      ) ?? options.find((option) => option.key === key)
    if (next) setSort(next)
  }

  function handleSortOption(value: string) {
    const next = options.find((option) => makeSortKey(option) === value)
    if (next) setSort(next)
  }

  return {
    sortKey: sort.key,
    sortDirection: sort.direction,
    currentSortKey: makeSortKey(sort),
    setSort,
    handleSort,
    handleSortOption,
  }
}
