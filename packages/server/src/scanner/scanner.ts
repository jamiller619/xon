import type { Dirent, Stats } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { EXTENSION_TO_MIME, getMediaCategory } from '@xon/media-types'
import type { MediaCategory } from '@xon/shared'
import type { MediaItem } from '../db/schema.js'
import { getMediaProviderPlugin } from '../plugins/mediaProviderPluginRegistry.js'

export type FileEntry = {
  filePath: string
  fileName: string
  fileSize: number
  extension: string
  mimeType: string | undefined
  mediaCategory: MediaCategory
}

export type ScanResult = {
  discovered: FileEntry[]
  newFiles: FileEntry[]
  changedFiles: FileEntry[]
  removedFilePaths: string[]
}

async function walkDirectory(
  dirPath: string,
  recursive: boolean,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = []

  let dirEntries: Dirent[]
  try {
    dirEntries = await readdir(dirPath, { withFileTypes: true })
  } catch (err) {
    console.error(`Scanner: cannot read directory ${dirPath}:`, err)
    return entries
  }

  for (const entry of dirEntries) {
    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (recursive) {
        const subEntries = await walkDirectory(fullPath, recursive)
        entries.push(...subEntries)
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase()
      const mediaCategory = getMediaCategory(fullPath)

      if (!mediaCategory) continue

      let fileStat: Stats
      try {
        fileStat = await stat(fullPath)
      } catch (err) {
        console.error(`Scanner: cannot stat file ${fullPath}:`, err)
        continue
      }

      entries.push({
        filePath: fullPath,
        fileName: basename(fullPath),
        fileSize: fileStat.size,
        extension: ext,
        mimeType: EXTENSION_TO_MIME[ext],
        mediaCategory,
      })
    }
  }

  return entries
}

async function scanPluginDataSource(
  pluginId: string,
  path: string,
): Promise<FileEntry[]> {
  const plugin = getMediaProviderPlugin(pluginId)
  if (!plugin) {
    console.error(
      `Scanner: no MediaProviderPlugin registered for pluginId "${pluginId}"`,
    )
    return []
  }

  let providerFiles: Awaited<ReturnType<typeof plugin.listFiles>>
  try {
    providerFiles = await plugin.listFiles(path)
  } catch (err) {
    console.error(
      `Scanner: plugin "${pluginId}" listFiles("${path}") failed:`,
      err,
    )
    return []
  }

  const entries: FileEntry[] = []
  for (const file of providerFiles) {
    const mediaCategory = getMediaCategory(file.name)
    if (!mediaCategory) continue

    const ext = extname(file.name).toLowerCase()
    entries.push({
      filePath: file.path,
      fileName: file.name,
      fileSize: file.size,
      extension: ext,
      mimeType: file.mimeType ?? EXTENSION_TO_MIME[ext],
      mediaCategory,
    })
  }
  return entries
}

export async function scanDataSource(
  dataSource: {
    type?: string
    path: string
    recursive: boolean
    pluginId?: string | null
  },
  existingItems: Pick<MediaItem, 'filePath' | 'fileSize'>[] = [],
): Promise<ScanResult> {
  let discovered: FileEntry[]

  if (dataSource.type === 'plugin' && dataSource.pluginId) {
    discovered = await scanPluginDataSource(
      dataSource.pluginId,
      dataSource.path,
    )
  } else {
    discovered = await walkDirectory(dataSource.path, dataSource.recursive)
  }

  const existingMap = new Map<string, number>()
  for (const item of existingItems) {
    existingMap.set(item.filePath, item.fileSize)
  }

  const discoveredPaths = new Set(discovered.map((e) => e.filePath))

  const newFiles: FileEntry[] = []
  const changedFiles: FileEntry[] = []

  for (const entry of discovered) {
    const existingSize = existingMap.get(entry.filePath)
    if (existingSize === undefined) {
      newFiles.push(entry)
    } else if (existingSize !== entry.fileSize) {
      changedFiles.push(entry)
    }
  }

  const removedFilePaths = [...existingMap.keys()].filter(
    (p) => !discoveredPaths.has(p),
  )

  return { discovered, newFiles, changedFiles, removedFilePaths }
}
