import { availableParallelism } from 'node:os'
import type { ContentType, DataSource } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import pLimit from 'p-limit'
import type { mediaItems } from '../db/schema.ts'
import type { Logger } from '../logger.ts'
import type { FileEntry } from './fileEntry.ts'

export async function runPipeline(
  ctx: PipelineContext,
  jobs: MediaJob[],
  stageList: PipelineStage[],
) {
  const concurrency = availableParallelism()
  const limit = pLimit(concurrency)
  const pipelineStart = Date.now()
  let processed = 0
  let activeJobs = 0
  const itemStages = stageList.filter(isItemPipelineStage)
  const stageLimits = new Map(
    itemStages.flatMap((stage) =>
      stage.concurrency === undefined
        ? []
        : [[stage.name, pLimit(stage.concurrency)] as const],
    ),
  )
  const activeStages = new Map<string, number>()
  const stageTimings = new Map<string, StageTiming>()
  const reportedSlowStages = new Set<string>()

  ctx.logger.info('Scan pipeline started', {
    libraryId: ctx.libraryPublicId,
    contentType: ctx.contentType,
    jobs: jobs.length,
    concurrency,
    stages: stageList.map((stage) => stage.name),
  })

  const heartbeat = setInterval(() => {
    ctx.logger.info('Scan pipeline still running', {
      libraryId: ctx.libraryPublicId,
      durationMs: Date.now() - pipelineStart,
      processedFiles: processed,
      totalFiles: jobs.length,
      activeJobs,
      activeStages: Object.fromEntries(activeStages),
      stageTimings: summarizeStageTimings(stageList, stageTimings),
    })
  }, PIPELINE_HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()

  try {
    const itemResults = await Promise.allSettled(
      jobs.map((job) =>
        limit(async () => {
          activeJobs += 1
          try {
            for await (const stage of itemStages) {
              const errorsBefore = job.errors.length
              const stageStart = Date.now()
              incrementActiveStage(activeStages, stage.name)

              const stageLimit = stageLimits.get(stage.name)
              const result = stageLimit
                ? await stageLimit(() => runStage(ctx, job, stage))
                : await runStage(ctx, job, stage)
              const durationMs = Date.now() - stageStart
              const failed = job.errors.length > errorsBefore
              recordStageTiming(stageTimings, stage.name, durationMs, failed)
              decrementActiveStage(activeStages, stage.name)

              if (
                durationMs >= SLOW_STAGE_THRESHOLD_MS &&
                !reportedSlowStages.has(stage.name)
              ) {
                reportedSlowStages.add(stage.name)
                ctx.logger.warn('Slow scan stage detected', {
                  libraryId: ctx.libraryPublicId,
                  stage: stage.name,
                  file: job.file.path,
                  durationMs,
                })
              }

              if (failed) {
                ctx.logger.error(`Stage failed: ${stage.name}`, {
                  jobId: job.data.id,
                  file: job.file.path,
                  errors: job.errors
                    .slice(errorsBefore)
                    .map((err) => err.message),
                })
                continue
              }

              if (result) {
                Object.assign(job.data, result)

                ctx.logger.debug(`${stage.name} stage complete`, {
                  file: job.file.path,
                  fields: Object.keys(result),
                  durationMs,
                })
              }
            }
          } finally {
            activeJobs -= 1
          }

          processed += 1
          ctx.onJobComplete?.(processed, job.file.path)
        }),
      ),
    )

    const unexpectedFailures = itemResults.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (unexpectedFailures.length > 0) {
      ctx.logger.error('Scan pipeline jobs failed unexpectedly', {
        libraryId: ctx.libraryPublicId,
        failedJobs: unexpectedFailures.length,
        errors: unexpectedFailures.map(errorMessage),
      })
      throw new AggregateError(
        unexpectedFailures,
        `${unexpectedFailures.length} scan pipeline job${unexpectedFailures.length === 1 ? '' : 's'} failed unexpectedly`,
      )
    }

    ctx.logger.info('Scan item stages finished', {
      libraryId: ctx.libraryPublicId,
      durationMs: Date.now() - pipelineStart,
      processedFiles: processed,
      totalFiles: jobs.length,
      failedFiles: jobs.filter((job) => job.errors.length > 0).length,
      stageTimings: summarizeStageTimings(stageList, stageTimings),
    })

    for (const stage of stageList) {
      if (!isFinalPipelineStage(stage)) continue
      const stageStart = Date.now()
      incrementActiveStage(activeStages, stage.name)
      ctx.logger.info('Final scan stage started', {
        libraryId: ctx.libraryPublicId,
        stage: stage.name,
      })

      let failed = false
      try {
        await stage.runAfterAll(ctx, jobs)
      } catch (err) {
        failed = true
        ctx.logger.error(`Stage failed: ${stage.name}`, {
          errors: [(err as Error).message],
        })
      } finally {
        const durationMs = Date.now() - stageStart
        recordStageTiming(stageTimings, stage.name, durationMs, failed)
        decrementActiveStage(activeStages, stage.name)
        ctx.logger.info('Final scan stage finished', {
          libraryId: ctx.libraryPublicId,
          stage: stage.name,
          durationMs,
          failed,
        })
      }
    }

    ctx.logger.info('Scan pipeline finished', {
      libraryId: ctx.libraryPublicId,
      durationMs: Date.now() - pipelineStart,
      processedFiles: processed,
      totalFiles: jobs.length,
      failedFiles: jobs.filter((job) => job.errors.length > 0).length,
      stageTimings: summarizeStageTimings(stageList, stageTimings),
    })
  } finally {
    clearInterval(heartbeat)
  }
}

const PIPELINE_HEARTBEAT_INTERVAL_MS = 15_000
const SLOW_STAGE_THRESHOLD_MS = 10_000

type StageTiming = {
  calls: number
  failedCalls: number
  totalDurationMs: number
  maxDurationMs: number
}

function recordStageTiming(
  timings: Map<string, StageTiming>,
  stageName: string,
  durationMs: number,
  failed: boolean,
): void {
  const timing = timings.get(stageName) ?? {
    calls: 0,
    failedCalls: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  }
  timing.calls += 1
  if (failed) timing.failedCalls += 1
  timing.totalDurationMs += durationMs
  timing.maxDurationMs = Math.max(timing.maxDurationMs, durationMs)
  timings.set(stageName, timing)
}

function summarizeStageTimings(
  stages: PipelineStage[],
  timings: Map<string, StageTiming>,
): Record<string, StageTiming & { averageDurationMs: number }> {
  return Object.fromEntries(
    stages.flatMap((stage) => {
      const timing = timings.get(stage.name)
      if (!timing) return []
      return [
        [
          stage.name,
          {
            ...timing,
            averageDurationMs: Math.round(
              timing.totalDurationMs / timing.calls,
            ),
          },
        ],
      ]
    }),
  )
}

function incrementActiveStage(
  activeStages: Map<string, number>,
  stageName: string,
): void {
  activeStages.set(stageName, (activeStages.get(stageName) ?? 0) + 1)
}

function decrementActiveStage(
  activeStages: Map<string, number>,
  stageName: string,
): void {
  const count = (activeStages.get(stageName) ?? 1) - 1
  if (count > 0) activeStages.set(stageName, count)
  else activeStages.delete(stageName)
}

export type PipelineContext = {
  db: LibSQLDatabase
  libraryId: number
  libraryPublicId: string
  contentType: ContentType
  logger: Logger
  ownerId?: number
  dataSource?: DataSource
  musicFolderAssets?: {
    artworkPaths: string[]
    playlistPaths: string[]
  }
  onJobActivity?: (currentFile: string, activity: string) => void
  onJobComplete?: (processed: number, currentFile: string) => void
}

export type MediaJobData = Partial<
  Omit<
    typeof mediaItems.$inferInsert,
    | 'createdAt'
    | 'updatedAt'
    | 'filePath'
    | 'fileSize'
    | 'scannedAt'
    | 'id'
    | 'publicId'
    | 'libraryId'
  >
> & {
  id?: number
  publicId: string
}

export type ItemPipelineStage = {
  name: string
  run(
    ctx: PipelineContext,
    job: MediaJob,
  ): Promise<Partial<MediaJobData> | undefined>
  retry?: number
  retryDelayMs?: number
  shouldRetry?: (error: unknown) => boolean
  concurrency?: number
  timeoutMs?: number
}

export type FinalPipelineStage = {
  name: string
  runAfterAll(ctx: PipelineContext, jobs: MediaJob[]): Promise<void>
}

export type PipelineStage = ItemPipelineStage | FinalPipelineStage

export type MediaJob = {
  id: string
  type: 'new' | 'changed' | 'refresh'
  file: FileEntry
  libraryId: number
  libraryPublicId: string
  contentType: ContentType
  mediaTypes: string[]
  dataSourcePath: string
  dataSourceId: string

  // mutable state through pipeline
  data: MediaJobData

  errors: Error[]
}

async function runStage(
  ctx: PipelineContext,
  job: MediaJob,
  stage: ItemPipelineStage,
) {
  try {
    return await withRetry(
      () => stage.run(ctx, job),
      stage.retry ?? 0,
      stage.retryDelayMs ?? 0,
      stage.shouldRetry,
      (error, attempt, delayMs) => {
        ctx.logger.warn('Retrying scan stage', {
          libraryId: ctx.libraryPublicId,
          stage: stage.name,
          file: job.file.path,
          attempt,
          delayMs,
          error: errorMessage(error),
        })
      },
    )
  } catch (err) {
    job.errors.push(err as Error)
  }
}

function isItemPipelineStage(stage: PipelineStage): stage is ItemPipelineStage {
  return 'run' in stage
}

function isFinalPipelineStage(
  stage: PipelineStage,
): stage is FinalPipelineStage {
  return 'runAfterAll' in stage
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  retryDelayMs = 0,
  shouldRetry: (error: unknown) => boolean = () => true,
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === retries || !shouldRetry(err)) throw err
      const delayMs = retryDelayMs * 2 ** i
      onRetry?.(err, i + 1, delayMs)
      if (delayMs > 0) await delay(delayMs)
    }
  }
  throw lastErr
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
