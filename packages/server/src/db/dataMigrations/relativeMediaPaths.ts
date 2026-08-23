import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { type DataSource, DataSourceType } from '@xon/shared'
import { eq, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { toLocalPath } from '../../scanner/scanner.ts'
import { libraries, mediaItems } from '../schema.ts'

const MIGRATION_ID = '0005_relative_media_paths'

function parseJson<T>(value: unknown): T | null {
  try {
    return (typeof value === 'string' ? JSON.parse(value) : value) as T
  } catch {
    return null
  }
}

export function identifyDataSources(sources: DataSource[]): {
  sources: DataSource[]
  changed: boolean
} {
  let changed = false
  const identified = sources.map((source) => {
    if (source.id) return source
    changed = true
    return { ...source, id: randomUUID() }
  })
  return { sources: identified, changed }
}

export function matchMediaSource(
  absoluteFilePath: string,
  sources: DataSource[],
): { dataSourceId: string; filePath: string } | null {
  if (!path.isAbsolute(absoluteFilePath)) return null
  const candidate = path.resolve(absoluteFilePath)
  const matches = sources
    .filter(
      (source): source is DataSource & { id: string } =>
        Boolean(source.id) && source.type === DataSourceType.local,
    )
    .flatMap((source) => {
      const root = path.resolve(toLocalPath(source.path))
      const relative = path.relative(root, candidate)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return []
      }
      return [{ source, root, relative }]
    })
    .sort((left, right) => right.root.length - left.root.length)
  const match = matches[0]
  if (!match) return null
  return {
    dataSourceId: match.source.id,
    filePath: match.relative.split(path.sep).join(path.posix.sep),
  }
}

export async function migrateRelativeMediaPaths(
  db: LibSQLDatabase,
): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS xon_data_migrations (
      id text PRIMARY KEY NOT NULL,
      applied_at integer NOT NULL
    )
  `)
  const applied = await db.all<{ id: string }>(sql`
    SELECT id FROM xon_data_migrations WHERE id = ${MIGRATION_ID}
  `)
  if (applied.length > 0) return

  const libraryRows = await db
    .select({
      id: libraries.id,
      dataSources: sql<unknown>`${libraries.dataSources}`,
    })
    .from(libraries)
  const mediaRows = await db
    .select({
      id: mediaItems.id,
      libraryId: mediaItems.libraryId,
      dataSourceId: mediaItems.dataSourceId,
      filePath: mediaItems.filePath,
    })
    .from(mediaItems)
  const sourcesByLibrary = new Map<number, DataSource[]>()

  await db.transaction(async (tx) => {
    for (const row of libraryRows) {
      const parsed = parseJson<DataSource[]>(row.dataSources)
      if (!Array.isArray(parsed)) continue
      const result = identifyDataSources(parsed)
      sourcesByLibrary.set(row.id, result.sources)
      if (result.changed) {
        await tx
          .update(libraries)
          .set({ dataSources: result.sources })
          .where(eq(libraries.id, row.id))
      }
    }

    for (const row of mediaRows) {
      if (row.dataSourceId && !path.isAbsolute(row.filePath)) continue
      const match = matchMediaSource(
        row.filePath,
        sourcesByLibrary.get(row.libraryId) ?? [],
      )
      if (!match) continue
      await tx.update(mediaItems).set(match).where(eq(mediaItems.id, row.id))
    }

    await tx.run(sql`
      INSERT INTO xon_data_migrations (id, applied_at)
      VALUES (${MIGRATION_ID}, ${Date.now()})
    `)
  })
}
