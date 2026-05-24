import { CATEGORY_DEFINITIONS } from '@xon/shared'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import config from '../config.ts'
import { libraries } from '../db/schema.ts'
import { createLogger } from '../logger.ts'
import { type MediaJob, type PipelineContext, runPipeline } from './pipeline.ts'
import { scanDataSource } from './scanner.ts'
import MetadataStage from './stages/MetadataStage.ts'
import { DRMStage, PersistStage, ThumbnailStage, TitleStage } from './stages.ts'

const logger = createLogger('orchestrator')

export type ScanProgress = {
  dataSourceId: string
  totalFiles: number
  processedFiles: number
  currentFile: string | null
}

export type ScanSummary = {
  libraryId: string
  newItems: number
  updatedItems: number
  removedItems: number
  totalDiscovered: number
  duration: number
}

export async function scanLibrary(
  db: LibSQLDatabase,
  libraryId: string,
  // onProgress?: (progress: ScanProgress) => void,
  // dataDir?: string,
): Promise<ScanSummary> {
  const scanStart = Date.now()
  const resolvedDataDir = config.get('appdata.path')
  const libraryRows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, libraryId))

  if (libraryRows.length === 0 || libraryRows[0] == null) {
    throw new Error(`Library not found: ${libraryId}`)
  }

  const library = libraryRows[0]
  const mediaTypes = library.mediaCategories ?? []
  const hasTypeFilter = mediaTypes.length > 0

  logger.log(`Scan started: "${library.name}"`, {
    libraryId,
    sources: library.dataSources.length,
    typeFilter: hasTypeFilter ? mediaTypes : 'none',
  })

  const ctx: PipelineContext = {
    db,
    libraryId,
    dataDir: resolvedDataDir,
    logger,
  }

  let totalNew = 0
  let totalUpdated = 0
  let totalRemoved = 0
  let totalDiscovered = 0

  for await (const source of library.dataSources) {
    const mediaCategories =
      library.mediaCategories ?? Object.keys(CATEGORY_DEFINITIONS)
    const result = await scanDataSource(library.id, source, mediaCategories)

    totalNew += result.newFiles.length
    totalUpdated += result.changedFiles.length
    totalRemoved += result.removedFilePaths.length
    totalDiscovered += result.discovered.length

    // for await (const file of result.newFiles) {
    //   onProgress?.({
    //     dataSourceId: source.id,
    //     totalFiles: result.newFiles.length,
    //     processedFiles: totalNew,
    //     currentFile: file.fileName,
    //   })
    // }

    const jobs: MediaJob[] = [
      ...result.newFiles.map(
        (f) =>
          ({
            id: crypto.randomUUID(),
            type: 'new',
            entry: f,
            errors: [],
            data: {
              metadata: {},
            },
            mediaCategories,
          }) as MediaJob,
      ),
      ...result.changedFiles.map(
        (f) =>
          ({
            id: crypto.randomUUID(),
            type: 'changed',
            entry: f,
            errors: [],
            data: {
              metadata: {},
            },
            mediaCategories,
          }) as MediaJob,
      ),
    ]

    await runPipeline(ctx, jobs, [
      TitleStage,
      DRMStage,
      MetadataStage,
      PersistStage,
      ThumbnailStage,
    ])
  }

  const duration = Date.now() - scanStart
  const summary: ScanSummary = {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
    duration,
  }

  logger.log(`Scan finished: "${library.name}"`, summary)

  return summary
}
