import fsp from 'node:fs/promises'
import path, { extname } from 'node:path'
import type { MediaProviderFile } from '@xon/plugin-sdk'
import { fileTypeFromFile } from 'file-type'
import mime from 'mime-types'

export type FileEntry = Omit<MediaProviderFile, 'mediaType'> & {
  ext: string
  /**
   * MIME type of the file
   */
  mediaType: string
}

export async function createFileEntry(filePath: string): Promise<FileEntry> {
  const ext = extname(filePath).toLowerCase()
  const mediaType = await getMimeType(filePath)
  const stats = await fsp.stat(filePath)

  return {
    id: filePath,
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    ext,
    mediaType,
  }
}

async function getMimeType(filePath: string): Promise<string> {
  const quickLookup = mime.lookup(filePath)

  if (quickLookup) return quickLookup

  const slowLookup = await fileTypeFromFile(filePath)

  if (slowLookup) return slowLookup.mime

  throw new Error(`Could not determine mime type for ${filePath}`)
}
