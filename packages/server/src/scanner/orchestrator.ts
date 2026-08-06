import { basename, extname } from 'node:path'
import { DataSourceType, LibraryType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import mime from 'mime-types'
import { mediaItems } from '../db/schema.ts'
import { createLogger } from '../logger.ts'
import {
  findMediaDataSource,
  resolveMediaFilePath,
} from '../media/mediaFilePaths.ts'
import * as libraryService from '../services/libraryService.ts'
import { LocalDiscoverer } from './discoverers/LocalDiscoverer.ts'
import type {
  DiscoveryContext,
  MediaDiscoverer,
} from './discoverers/MediaDiscoverer.ts'
import { PluginDiscoverer } from './discoverers/PluginDiscoverer.ts'
import type { FileEntry } from './fileEntry.ts'
import {
  type MediaJob,
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

const stages: Record<LibraryType, PipelineStage[]> = {
  [LibraryType.Movies]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.libraryMetadata,
    stage.persist,
    stage.person,
    stage.thumbnail,
  ],
  [LibraryType.Photos]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.persist,
    stage.thumbnail,
  ],
  [LibraryType.TVShows]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.libraryMetadata,
    stage.persist,
    stage.person,
    stage.thumbnail,
  ],
  [LibraryType.Music]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.libraryMetadata,
    stage.persist,
    stage.thumbnail,
  ],
  [LibraryType.HomeVideos]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.libraryMetadata,
    stage.persist,
    stage.thumbnail,
  ],
  [LibraryType.MusicVideos]: [
    stage.drm,
    stage.title,
    stage.fileMetadata,
    stage.libraryMetadata,
    stage.persist,
    stage.thumbnail,
  ],
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

  const extSet = getExtensionsForLibraryType(library.type)

  let totalNew = 0
  let totalUpdated = 0
  let totalRemoved = 0
  let totalDiscovered = 0

  for await (const dataSource of dataSources) {
    const sourceLabel =
      dataSource.type === DataSourceType.plugin
        ? `${dataSource.pluginId}:${dataSource.path}`
        : toLocalPath(dataSource.path)

    logger.debug(`Scanning data source: ${sourceLabel}`)

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
      dataSourceId: dataSource.id,
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
      logger.debug(
        `No new or changed files found in data source: ${sourceLabel}`,
      )
      onProgress?.({
        dataSourceId: dataSource.id,
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
      dataSourceId: dataSource.id,
      phase: 'processing',
      discoveredFiles: discovery.totalDiscovered,
      totalFiles,
      processedFiles: 0,
      currentFile: null,
      message: `Found ${discovery.totalDiscovered} files, ${totalFiles} to process in ${sourceLabel}`,
    })

    const ctx: PipelineContext = {
      db,
      libraryId,
      libraryType: library.type,
      logger,
    }

    if (onProgress) {
      ctx.onJobComplete = (processed, currentFile) => {
        onProgress({
          dataSourceId: dataSource.id,
          phase: 'processing',
          discoveredFiles: discovery.totalDiscovered,
          totalFiles,
          processedFiles: processed,
          currentFile,
          message: `Processing ${processed}/${totalFiles}: ${basename(currentFile)}`,
        })
      }
    }

    logger.debug(
      `Beginning pipeline stage for ${library.name} / ${sourceLabel}`,
    )

    await runPipeline(ctx, discovery.jobs, stages[library.type])

    discovery.reconcile()
  }

  const summary: ScanSummary = {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
  }

  logger.debug(`Scan finished: "${library.name}"`, {
    ...summary,
    duration: Date.now() - scanStart,
  })

  return summary
}

const sharedRefreshStages: PipelineStage[] = [
  stage.libraryMetadata,
  stage.persist,
  stage.person,
  stage.thumbnail,
]

/**
 * Stages for a metadata refresh of already-persisted items: re-runs metadata
 * plugins against existing rows (title and fileMetadata are seeded from the
 * stored row, so no drm/title/fileMetadata probing). The thumbnail stage runs
 * too, so a refresh backfills artwork for items a plugin didn't match — it
 * no-ops for movies/shows that already have plugin images.
 */
const refreshStages: Record<
  Exclude<LibraryType, 'home_videos' | 'photos'>,
  PipelineStage[]
> = {
  [LibraryType.Movies]: sharedRefreshStages,
  [LibraryType.TVShows]: sharedRefreshStages,
  [LibraryType.Music]: [stage.libraryMetadata, stage.persist, stage.thumbnail],
  [LibraryType.MusicVideos]: [
    stage.libraryMetadata,
    stage.persist,
    stage.thumbnail,
  ],
}

/**
 * Re-run metadata plugins against already-persisted media items — the whole
 * library, or a single item when mediaItemId is given. Unlike a scan, this
 * never touches the filesystem: jobs are built from stored rows and only the
 * metadata/persist/person stages run.
 */
export async function refreshMetadata(
  db: LibSQLDatabase,
  libraryId: string,
  mediaItemId?: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanSummary> {
  const refreshStart = Date.now()
  const library = await libraryService.getLibraryById(db, libraryId)

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`)
  }

  if (
    library.type === LibraryType.Photos ||
    library.type === LibraryType.HomeVideos
  ) {
    throw new Error(
      `Metadata refresh is not supported for library type: ${library.type}`,
    )
  }

  const items = await db
    .select()
    .from(mediaItems)
    .where(
      mediaItemId
        ? and(
            eq(mediaItems.libraryId, libraryId),
            eq(mediaItems.id, mediaItemId),
          )
        : eq(mediaItems.libraryId, libraryId),
    )

  if (mediaItemId && items.length === 0) {
    throw new Error(`Media item not found: ${mediaItemId}`)
  }

  const jobs: MediaJob[] = items.map((item) => {
    const source = findMediaDataSource(library.dataSources, item.dataSourceId)
    const absoluteFilePath = source
      ? resolveMediaFilePath(item.filePath, source)
      : item.filePath
    const file: FileEntry = {
      id: absoluteFilePath,
      path: absoluteFilePath,
      name: basename(absoluteFilePath),
      size: item.fileSize,
      createdAt: item.createdAt,
      modifiedAt: item.updatedAt ?? item.createdAt,
      ext: extname(absoluteFilePath).toLowerCase(),
      mediaType: item.mediaType,
    }

    // Seed existing match ids so plugins can do exact lookups (e.g. OMDb by
    // IMDb id) instead of title searches, even when an earlier plugin misses.
    const seed: Record<string, unknown> = {}
    if (item.metadata.tmdbId != null) seed.tmdbId = item.metadata.tmdbId
    if (item.metadata.imdbId != null) seed.imdbId = item.metadata.imdbId

    return {
      id: crypto.randomUUID(),
      type: 'refresh',
      file,
      errors: [],
      libraryId,
      libraryType: library.type,
      dataSourceId: source?.id ?? '',
      dataSourcePath: source ? toLocalPath(source.path) : '',
      mediaTypes: [],
      data: {
        id: item.id,
        title: item.title,
        fileMetadata: item.fileMetadata,
        metadata: seed,
        matchId: item.matchId,
        matchIdSource: item.matchIdSource,
      },
    }
  })

  const totalFiles = jobs.length

  onProgress?.({
    dataSourceId: libraryId,
    phase: 'processing',
    discoveredFiles: totalFiles,
    totalFiles,
    processedFiles: 0,
    currentFile: null,
    message: `Refreshing metadata for ${totalFiles} item${totalFiles === 1 ? '' : 's'} in ${library.name}`,
  })

  const ctx: PipelineContext = {
    db,
    libraryId,
    libraryType: library.type,
    logger,
  }

  if (onProgress) {
    ctx.onJobComplete = (processed, currentFile) => {
      onProgress({
        dataSourceId: libraryId,
        phase: 'processing',
        discoveredFiles: totalFiles,
        totalFiles,
        processedFiles: processed,
        currentFile,
        message: `Refreshing metadata ${processed}/${totalFiles}: ${basename(currentFile)}`,
      })
    }
  }

  await runPipeline(ctx, jobs, refreshStages[library.type])

  const summary: ScanSummary = {
    libraryId,
    newItems: 0,
    updatedItems: totalFiles,
    removedItems: 0,
    totalDiscovered: totalFiles,
  }

  logger.debug(`Metadata refresh finished: "${library.name}"`, {
    ...summary,
    duration: Date.now() - refreshStart,
  })

  return summary
}

export function getExtensionsForLibraryType(
  libraryType: LibraryType,
): Set<string> {
  const mimePrefix: Record<LibraryType, string> = {
    [LibraryType.Movies]: 'video',
    [LibraryType.TVShows]: 'video',
    [LibraryType.Music]: 'audio',
    [LibraryType.Photos]: 'image',
    [LibraryType.HomeVideos]: 'video',
    [LibraryType.MusicVideos]: 'video',
  }

  return new Set(
    Object.entries(mime.extensions)
      .filter(([mimeType]) =>
        mimeType.startsWith(`${mimePrefix[libraryType]}/`),
      )
      .flatMap(([, fileExtensions]) => fileExtensions.map((ext) => `.${ext}`)),
  )
}
