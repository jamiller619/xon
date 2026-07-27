import type { Library, MediaItem } from '@xon/shared'

export type ViewProps = {
  isLoading: boolean
  library?: Library | undefined
  items: MediaItem[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  resetKey: string
}
