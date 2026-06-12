import { DataSourceType, LIBRARY_TYPE_DEFINITIONS } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createLogger } from '../logger.ts'
import * as libraryService from '../services/libraryService.ts'
import { LocalDiscoverer } from './discoverers/LocalDiscoverer.ts'
import type {
  DiscoveryContext,
  MediaDiscoverer,
} from './discoverers/MediaDiscoverer.ts'
import { PluginDiscoverer } from './discoverers/PluginDiscoverer.ts'
import { type PipelineContext, runPipeline } from './pipeline.ts'
import { toLocalPath } from './scanner.ts'
import * as stage from './stages.ts'

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
}

const pipelineStages = [
  stage.drm,
  stage.metadata,
  stage.title,
  stage.persist,
  stage.person,
  stage.thumbnail,
]

const discoverers: Partial<Record<DataSourceType, MediaDiscoverer>> = {
  [DataSourceType.local]: new LocalDiscoverer(),
  [DataSourceType.plugin]: new PluginDiscoverer(),
}

export async function scanLibrary(
  db: LibSQLDatabase,
  libraryId: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanSummary> {
  const scanStart = Date.now()
  const library = await libraryService.getLibraryById(db, libraryId)

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`)
  }

  const { types, dataSources } = library

  if (dataSources.length === 0) {
    throw new Error(`No data sources found for library: ${libraryId}`)
  }

  const extSet = new Set(
    types.flatMap((c) => Object.keys(LIBRARY_TYPE_DEFINITIONS[c])),
  )

  let totalNew = 0
  let totalUpdated = 0
  let totalRemoved = 0
  let totalDiscovered = 0

  for await (const dataSource of dataSources) {
    const sourceLabel =
      dataSource.type === DataSourceType.plugin
        ? `${dataSource.pluginId}:${dataSource.path}`
        : toLocalPath(dataSource.path)

    logger.log(`Scanning data source: ${sourceLabel}`)

    const discoverer = discoverers[dataSource.type]

    if (!discoverer) {
      logger.warn(`Unsupported data source type: ${dataSource.type}`)
      continue
    }

    for await (const libraryType of library.types) {
      const discoveryCtx: DiscoveryContext = {
        db,
        libraryId,
        dataSource,
        extSet,
        libraryType,
      }

      const discovery = await discoverer.discover(discoveryCtx)

      if (!discovery) continue

      totalDiscovered += discovery.totalDiscovered
      totalRemoved += discovery.removedCount

      if (discovery.jobs.length === 0) {
        logger.log(
          `No new or changed files found in data source: ${sourceLabel}`,
        )
        discovery.reconcile()
        continue
      }

      for (const job of discovery.jobs) {
        if (job.type === 'new') totalNew += 1
        else totalUpdated += 1
      }

      const totalFiles = discovery.jobs.length

      onProgress?.({
        dataSourceId: dataSource.path,
        totalFiles,
        processedFiles: 0,
        currentFile: null,
      })

      const ctx: PipelineContext = { db, libraryId, logger }

      if (onProgress) {
        ctx.onJobComplete = (processed, currentFile) => {
          onProgress({
            dataSourceId: dataSource.path,
            totalFiles,
            processedFiles: processed,
            currentFile,
          })
        }
      }

      logger.log(
        `Beginning pipeline stage for ${library.name} / ${sourceLabel}`,
      )

      await runPipeline(ctx, discovery.jobs, pipelineStages)

      discovery.reconcile()
    }
  }

  const summary: ScanSummary = {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
  }

  logger.log(`Scan finished: "${library.name}"`, {
    ...summary,
    duration: Date.now() - scanStart,
  })

  return summary
}
