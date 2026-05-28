import fsp from 'node:fs/promises'
import path, { extname } from 'node:path'
import type { MediaProviderFile } from '@xon/plugin-sdk'
import { fileTypeFromFile } from 'file-type'

export type FileEntry = MediaProviderFile & {
  ext: string
}

export async function createFileEntry(filePath: string): Promise<FileEntry> {
  const ext = extname(filePath).toLowerCase()
  const mimeType = await getMimeType(filePath)
  const stats = await fsp.stat(filePath)

  return {
    id: filePath,
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    ext,
    mimeType,
  }
}

async function getMimeType(
  filePath: string,
  mimeType?: string,
): Promise<string | undefined> {
  if (mimeType) return mimeType

  const result = await fileTypeFromFile(filePath)

  if (result) return result.mime
}
