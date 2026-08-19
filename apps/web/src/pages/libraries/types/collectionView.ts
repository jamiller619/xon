import type { ComponentPropsWithRef, ReactNode } from 'react'

export type SortDirection = 'asc' | 'desc'

export type SortValue<SortKey extends string> = {
  key: SortKey
  direction: SortDirection
}

export type SortOption<SortKey extends string> = SortValue<SortKey> & {
  label: string
}

export type SortPresentation = 'toolbar' | 'columns' | 'none'

export type LibraryViewModeDefinition<
  Mode extends string,
  SortKey extends string,
> = {
  id: Mode
  label: string
  icon: ReactNode
  sortPresentation: SortPresentation
  sortOptions: readonly SortOption<SortKey>[]
  defaultSort: SortValue<SortKey>
}

export type CollectionViewProps<Item> = {
  isLoading: boolean
  items: readonly Item[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  resetKey: string
  getItemKey: (item: Item) => string
  emptyContent?: ReactNode
}

export type ListColumn<SortKey extends string> = {
  key: string
  label?: ReactNode
  sortKey?: SortKey
  width?: string
}

export type ListRowProps = ComponentPropsWithRef<'tr'> & {
  'data-index': number
  'data-striped'?: boolean | undefined
}
