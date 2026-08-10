import { useState } from 'react'

const STORAGE_KEY_PREFIX = 'xon:libraryThumbnailSize:'

export const MIN_THUMBNAIL_SIZE = 120
export const MAX_THUMBNAIL_SIZE = 320
export const THUMBNAIL_SIZE_STEP = 10

function normalizeThumbnailSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback

  const clamped = Math.min(
    MAX_THUMBNAIL_SIZE,
    Math.max(MIN_THUMBNAIL_SIZE, value),
  )
  return (
    Math.round((clamped - MIN_THUMBNAIL_SIZE) / THUMBNAIL_SIZE_STEP) *
      THUMBNAIL_SIZE_STEP +
    MIN_THUMBNAIL_SIZE
  )
}

function storedThumbnailSize(libraryId: string, defaultSize: number) {
  const fallback = normalizeThumbnailSize(defaultSize, MIN_THUMBNAIL_SIZE)
  if (typeof localStorage === 'undefined') return fallback

  const value = localStorage.getItem(`${STORAGE_KEY_PREFIX}${libraryId}`)
  return value === null
    ? fallback
    : normalizeThumbnailSize(Number(value), fallback)
}

export function useLibraryThumbnailSize(
  libraryId: string,
  defaultSize: number,
) {
  const [selection, setSelection] = useState<{
    libraryId: string
    size: number
  }>(() => ({
    libraryId,
    size: storedThumbnailSize(libraryId, defaultSize),
  }))

  const thumbnailSize =
    selection.libraryId === libraryId
      ? selection.size
      : storedThumbnailSize(libraryId, defaultSize)

  function setThumbnailSize(size: number) {
    const normalizedSize = normalizeThumbnailSize(size, defaultSize)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${libraryId}`,
        String(normalizedSize),
      )
    }
    setSelection({ libraryId, size: normalizedSize })
  }

  return { thumbnailSize, setThumbnailSize }
}
