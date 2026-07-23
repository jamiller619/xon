import path from 'node:path'
import { filenameParse } from '@ctrl/video-filename-parser'
import type { Metadata } from '@xon/shared'

export function parseFilename(
  filePath: string,
  isTvShow?: boolean,
): {
  title: string
  metadata: Metadata
} {
  const extension = path.extname(filePath)
  const fileName = path.basename(filePath, extension)
  const parsed = filenameParse(fileName, isTvShow)
  const { title, ...metadata } = parsed

  return {
    title: normalizeMediaTitle(title),
    metadata,
  }
}

/**
 * Convert a filename-derived title into a metadata-search-friendly value.
 * Unicode letters and numbers are retained while release separators,
 * brackets, punctuation, symbols, and repeated whitespace are collapsed.
 *
 * Pass the source file extension when cleaning a previously stored title so
 * legacy values such as "The Social Network.avi" are repaired safely.
 */
export function normalizeMediaTitle(value: string, fileExtension = ''): string {
  let title = value.normalize('NFKC').trim()
  if (
    fileExtension &&
    title.toLowerCase().endsWith(fileExtension.toLowerCase())
  ) {
    title = title.slice(0, -fileExtension.length)
  }

  return title
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
