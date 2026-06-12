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
  const fileName = path.basename(filePath)
  const parsed = filenameParse(fileName, isTvShow)
  const { title, ...metadata } = parsed

  return {
    title,
    metadata,
  }
}
