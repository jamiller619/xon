import type { MediaItem } from '@xon/shared'

export type ViewProps = {
  isLoading: boolean
  items: MediaItem[]
  pageSize: number
}

export type ActiveFilter = {
  key: string
  label: string
  onRemove: () => void
}
