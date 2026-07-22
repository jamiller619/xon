import type { MediaItem } from '@xon/shared'

export function formatYear(data: MediaItem): string | undefined {
  if ('releaseDate' in data.metadata) {
    if (data.metadata.releaseDate.length > 4) {
      return new Date(data.metadata.releaseDate).getFullYear().toString()
    }

    return data.metadata.releaseDate
  }
}

export function formatDuration(data?: MediaItem): string | undefined {
  const value = data?.fileMetadata.duration

  if (!value) return

  const totalSeconds = Math.round(value)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = hours > 0 ? 0 : totalSeconds % 60

  return new Intl.DurationFormat(undefined, { style: 'narrow' }).format({
    hours,
    minutes,
    seconds,
  })
}

export function formatBytes(data?: MediaItem): string | undefined {
  const bytes = data?.fileSize

  if (bytes == null) return
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
