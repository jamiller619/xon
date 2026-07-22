import type { MediaItem } from '@xon/shared'

export type ViewProps = {
  isLoading: boolean
  items: MediaItem[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  resetKey: string
}
