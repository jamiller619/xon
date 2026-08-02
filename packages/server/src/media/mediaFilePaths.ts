import path from 'node:path'
import { type DataSource, DataSourceType } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { libraries, type MediaItem } from '../db/schema.ts'
import { toLocalPath } from '../scanner/scanner.ts'

function sourceRoot(source: DataSource): string {
  if (source.type !== DataSourceType.local) {
    throw new Error(`Cannot resolve non-local data source: ${source.id}`)
  }
  return path.resolve(toLocalPath(source.path))
}

export function relativeMediaFilePath(
  absolutePath: string,
  source: DataSource,
): string {
  const root = sourceRoot(source)
  const candidate = path.resolve(absolutePath)
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Media file is outside data source ${source.id}`)
  }
  return relative.split(path.sep).join(path.posix.sep)
}

export function resolveMediaFilePath(
  storedPath: string,
  source: DataSource,
): string {
  if (path.isAbsolute(storedPath)) return storedPath
  if (storedPath.includes('\\') || path.posix.isAbsolute(storedPath)) {
    throw new Error(`Invalid relative media path: ${storedPath}`)
  }
  const normalized = path.posix.normalize(storedPath)
  if (
    normalized !== storedPath ||
    normalized === '.' ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Invalid relative media path: ${storedPath}`)
  }
  const root = sourceRoot(source)
  const candidate = path.resolve(root, ...storedPath.split('/'))
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Media path escapes data source ${source.id}`)
  }
  return candidate
}

export function findMediaDataSource(
  sources: DataSource[],
  dataSourceId: string | null,
): DataSource | undefined {
  return dataSourceId
    ? sources.find((source) => source.id === dataSourceId)
    : undefined
}

export async function resolveMediaItemFilePath(
  db: LibSQLDatabase,
  item: Pick<MediaItem, 'libraryId' | 'dataSourceId' | 'filePath'>,
): Promise<string> {
  if (path.isAbsolute(item.filePath)) return item.filePath
  const rows = await db
    .select({ dataSources: libraries.dataSources })
    .from(libraries)
    .where(eq(libraries.id, item.libraryId))
  const library = rows[0]
  const source = findMediaDataSource(
    library?.dataSources ?? [],
    item.dataSourceId,
  )
  if (!source) throw new Error('Media item data source was not found')
  return resolveMediaFilePath(item.filePath, source)
}
