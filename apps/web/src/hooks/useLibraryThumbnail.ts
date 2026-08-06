import type { Library } from '@xon/shared'
import { useScanStore } from '~/store/scanStore'

type LibraryTransport = Omit<Library, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string
  updatedAt: Date | string | null
}

export default function useLibraryThumbnail(data: LibraryTransport): string {
  const scanCompletedAt = useScanStore((s) => s.completedAt)
  const thumbnailRevision =
    scanCompletedAt[data.id] ?? data.updatedAt ?? data.createdAt

  return `/api/libraries/${data.id}/thumbnail?v=${encodeURIComponent(String(thumbnailRevision))}`
}
