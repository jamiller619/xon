import path, { extname } from 'node:path'
import { fileTypeFromFile } from 'file-type'

export type FileEntry = {
  filePath: string
  fileName: string
  fileSize: number
  extension: string
  mimeType: string | undefined
}

export async function createFileEntry(file: {
  path: string
  size: number
  name?: string
  mimeType?: string
}): Promise<FileEntry | undefined> {
  const ext = extname(file.path).toLowerCase()
  const mimeType = await getMimeType(file.path, file.mimeType)

  return {
    filePath: file.path,
    fileName: file.name ?? path.basename(file.path),
    fileSize: file.size,
    extension: ext,
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
