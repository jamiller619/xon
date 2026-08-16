import type { MediaItem } from '@xon/shared'
import { formatDuration, formatYear } from './utils'

export type MetadataKey =
  | 'contentRating'
  | 'duration'
  | 'genres'
  | 'type'
  | 'voteAverage'
  | 'year'

export interface FormatMetadataOptions {
  separator?: string
}

const DEFAULT_SEPARATOR = ' · '

/** Builds the compact metadata line used by cards and result lists. */
export function formatMetadata(
  item: MediaItem | undefined,
  keys: readonly MetadataKey[],
  { separator = DEFAULT_SEPARATOR }: FormatMetadataOptions = {},
): string | undefined {
  if (!item) return

  const values = keys.flatMap((key) => {
    const value = metadataValue(item, key)
    return value ? [value] : []
  })

  return values.length > 0 ? values.join(separator) : undefined
}

/** Returns one normalized display value without coupling callers to raw data. */
export function metadataValue(
  item: MediaItem,
  key: MetadataKey,
): string | undefined {
  switch (key) {
    case 'contentRating':
      return stringValue(item.metadata.rated)
    case 'duration':
      return formatDuration(item)
    case 'genres':
      return formatGenres(item)
    case 'type':
      return formatGenres(item, 2) ?? formatMediaType(item.mediaType)
    case 'voteAverage': {
      const voteAverage = item.metadata.voteAverage
      return typeof voteAverage === 'number' && Number.isFinite(voteAverage)
        ? voteAverage.toFixed(1)
        : undefined
    }
    case 'year':
      return metadataYear(item) ?? formatYear(item)
  }
}

function metadataYear(item: MediaItem): string | undefined {
  const year = item.metadata.year
  if (typeof year === 'number' && Number.isInteger(year) && year > 0) {
    return String(year)
  }
  return stringValue(year)
}

function formatGenres(item: MediaItem, limit = 3): string | undefined {
  const genres = mediaGenres(item).slice(0, limit)
  return genres.length > 0 ? genres.join(' / ') : undefined
}

export function mediaGenres(item: MediaItem): string[] {
  const rawGenres = item.metadata.genres
  if (Array.isArray(rawGenres)) {
    const genres = rawGenres.flatMap((genre) => {
      const value = stringValue(genre)
      return value ? [value] : []
    })

    if (genres.length > 0) return genres
  }

  const genre = stringValue(item.metadata.genre)
  return genre ? [genre] : []
}

function formatMediaType(mediaType: string): string | undefined {
  const type = mediaType.split('/')[0]?.trim()
  return type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const normalized = value.trim()
  return normalized || undefined
}
