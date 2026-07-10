import { basename } from 'node:path'
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
import {
  type PipelineContext,
  type PipelineStage,
  runPipeline,
} from './pipeline.ts'
import { toLocalPath } from './scanner.ts'
import * as stage from './stages.ts'

const logger = createLogger('orchestrator')

export type ScanPhase = 'discovering' | 'processing' | 'done'

export type ScanProgress = {
  dataSourceId: string
  phase: ScanPhase
  /** Total files found on disk by the discoverer for this data source. */
  discoveredFiles: number
  /** Files that need processing (new or changed). */
  totalFiles: number
  processedFiles: number
  currentFile: string | null
  /** Human-readable status line for the UI banner. */
  message: string
}

export type ScanSummary = {
  libraryId: string
  newItems: number
  updatedItems: number
  removedItems: number
  totalDiscovered: number
}

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

  const { dataSources } = library

  if (dataSources.length === 0) {
    throw new Error(`No data sources found for library: ${libraryId}`)
  }

  const extSet = new Set(Object.keys(LIBRARY_TYPE_DEFINITIONS[library.type]))

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

    const discoveryCtx: DiscoveryContext = {
      db,
      libraryId,
      dataSource,
      extSet,
      libraryType: library.type,
    }

    onProgress?.({
      dataSourceId: dataSource.path,
      phase: 'discovering',
      discoveredFiles: 0,
      totalFiles: 0,
      processedFiles: 0,
      currentFile: null,
      message: `Discovering files in ${sourceLabel}`,
    })

    const discovery = await discoverer.discover(discoveryCtx)

    if (!discovery) continue

    totalDiscovered += discovery.totalDiscovered
    totalRemoved += discovery.removedCount

    const totalFiles = discovery.jobs.length

    if (totalFiles === 0) {
      logger.log(`No new or changed files found in data source: ${sourceLabel}`)
      onProgress?.({
        dataSourceId: dataSource.path,
        phase: 'processing',
        discoveredFiles: discovery.totalDiscovered,
        totalFiles: 0,
        processedFiles: 0,
        currentFile: null,
        message: `Found ${discovery.totalDiscovered} files, none to process in ${sourceLabel}`,
      })
      discovery.reconcile()
      continue
    }

    for (const job of discovery.jobs) {
      if (job.type === 'new') totalNew += 1
      else totalUpdated += 1
    }

    onProgress?.({
      dataSourceId: dataSource.path,
      phase: 'processing',
      discoveredFiles: discovery.totalDiscovered,
      totalFiles,
      processedFiles: 0,
      currentFile: null,
      message: `Found ${discovery.totalDiscovered} files, ${totalFiles} to process in ${sourceLabel}`,
    })

    const ctx: PipelineContext = { db, libraryId, logger }

    if (onProgress) {
      ctx.onJobComplete = (processed, currentFile) => {
        onProgress({
          dataSourceId: dataSource.path,
          phase: 'processing',
          discoveredFiles: discovery.totalDiscovered,
          totalFiles,
          processedFiles: processed,
          currentFile,
          message: `Processing ${processed}/${totalFiles}: ${basename(currentFile)}`,
        })
      }
    }

    logger.log(`Beginning pipeline stage for ${library.name} / ${sourceLabel}`)

    await runPipeline(ctx, discovery.jobs)

    discovery.reconcile()
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
