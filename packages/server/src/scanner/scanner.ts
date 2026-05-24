import fsp from 'node:fs/promises'
import path, { extname } from 'node:path'
import {
  CATEGORY_DEFINITIONS,
  type DataSource,
  type MediaCategory,
} from '@xon/shared'
import fileEntryCache from 'file-entry-cache'
import klaw from 'klaw'
import config from '../config.ts'
import { createLogger } from '../logger.ts'
import { getMediaProviderPlugin } from '../plugins/mediaProviderPluginRegistry.ts'
import { createFileEntry, type FileEntry } from './fileEntry.ts'

const logger = createLogger('scanner')

export type ScanResult = {
  discovered: FileEntry[]
  newFiles: FileEntry[]
  changedFiles: FileEntry[]
  removedFilePaths: string[]
}

async function* pluginSource(
  pluginId: string,
  dataSourcePath: string,
): AsyncGenerator<FileEntry> {
  const plugin = getMediaProviderPlugin(pluginId)

  if (!plugin) return

  const files = await plugin.listFiles(dataSourcePath)

  for (const file of files) {
    const entry = await createFileEntry(file)

    if (entry) yield entry
  }
}

async function* localSource(
  dir: string,
  extSet: Set<string>,
): AsyncGenerator<FileEntry> {
  for await (const file of klaw(dir)) {
    const ext = extname(file.path).toLowerCase()
    if (!extSet.has(ext)) continue

    const entry = await createFileEntry({
      path: file.path,
      size: file.stats.size,
    })

    if (entry) yield entry
  }
}

const scanCacheDir = path.join(config.get('appdata.cachePath'))
const scanCacheFilePath = path.join(scanCacheDir, 'scanner.json')

await fsp.mkdir(scanCacheDir, { recursive: true })

function createScannerCache(cacheId: string) {
  const cache = fileEntryCache.create(cacheId, scanCacheFilePath, {
    useAbsolutePathAsKey: true,
    restrictAccessToCwd: false,
    useCheckSum: true,
  })

  const previous = new Set(cache.cache.keys())

  return {
    isNewOrChanged(filePath: string) {
      const { changedFiles } = cache.analyzeFiles([filePath])
      return changedFiles.includes(filePath)
    },
    wasSeen(filePath: string) {
      return previous.has(filePath)
    },
    finalize(currentPaths: Set<string>) {
      const removed = [...previous].filter((p) => !currentPaths.has(p))
      cache.reconcile()
      return removed
    },
  }
}

export async function scanDataSource(
  libraryId: string,
  dataSource: DataSource,
  mediaCategories: MediaCategory[],
): Promise<ScanResult> {
  const sourceLabel =
    dataSource.type === 'plugin'
      ? `plugin:${dataSource.pluginId ?? 'unknown'}`
      : `${dataSource.type ?? 'local'}:${dataSource.path}`

  logger.log(`Scanning data source: ${sourceLabel}`)

  const exts = mediaCategories.flatMap((c) =>
    Object.keys(CATEGORY_DEFINITIONS[c]),
  )
  const extSet = new Set(exts)

  const source =
    dataSource.type === 'plugin' && dataSource.pluginId
      ? pluginSource(dataSource.pluginId, dataSource.path)
      : localSource(toLocalPath(dataSource.path), extSet)

  const discovered: FileEntry[] = []
  const newFiles: FileEntry[] = []
  const changedFiles: FileEntry[] = []
  let removedFilePaths: string[] = []

  let cache: ReturnType<typeof createScannerCache> | null = null
  const currentPaths = new Set<string>()

  if (dataSource.type !== 'plugin') {
    const cacheId = `${libraryId}-${dataSource.path}`
    cache = createScannerCache(cacheId)
  }

  for await (const entry of source) {
    discovered.push(entry)
    currentPaths.add(entry.filePath)

    if (!cache) continue

    if (!cache.isNewOrChanged(entry.filePath)) continue

    if (cache.wasSeen(entry.filePath)) {
      changedFiles.push(entry)
    } else {
      newFiles.push(entry)
    }
  }

  if (cache) {
    removedFilePaths = cache.finalize(currentPaths)
  }

  logger.log(`Data source scan complete: ${sourceLabel}`, {
    discovered: discovered.length,
    new: newFiles.length,
    changed: changedFiles.length,
    removed: removedFilePaths.length,
  })

  return { discovered, newFiles, changedFiles, removedFilePaths }
}

// Converts a Windows-style path to its WSL mount equivalent.
// E:\foo\bar → /mnt/e/foo/bar
// No-op for paths that are already Linux-style.
export function toLocalPath(inputPath: string): string {
  const match = /^([A-Za-z]):[/\\](.*)$/.exec(inputPath)
  if (match) {
    const drive = match[1]?.toLowerCase()
    const rest = match[2]?.replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`
  }
  return inputPath
}
