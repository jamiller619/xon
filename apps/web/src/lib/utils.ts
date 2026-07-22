import type { MediaItem } from '@xon/shared'

export function formatYear(data: MediaItem): string | undefined {
  const releaseDate = data.metadata.releaseDate
  if (typeof releaseDate !== 'string' || !releaseDate) return
  if (releaseDate.length <= 4) return releaseDate

  const year = new Date(releaseDate).getFullYear()
  return Number.isNaN(year) ? undefined : String(year)
}

export function formatDuration(data?: MediaItem): string | undefined {
  const value = data?.fileMetadata.duration

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return

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

  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function mediaPath(item: Pick<MediaItem, 'id' | 'title'>): string {
  const slug = item.title
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')

  return `/media/${encodeURIComponent(slug || 'media')}/${item.id}`
}
