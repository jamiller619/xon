import { availableParallelism } from 'node:os'
import type { LibraryType, MediaItem } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import pLimit from 'p-limit'
import type { Logger } from '../logger.ts'
import type { FileEntry } from './fileEntry.ts'
import * as stage from './stages.ts'

const stages: PipelineStage[] = [
  stage.drm,
  stage.title,
  stage.fileMetadata,
  stage.libraryMetadata,
  stage.persist,
  stage.person,
  stage.thumbnail,
]

/**
 * Stages for a metadata refresh of already-persisted items: re-runs metadata
 * plugins against existing rows without touching the file (no drm/thumbnail
 * probing — title and fileMetadata are seeded from the stored row).
 */
export const refreshStages: PipelineStage[] = [
  stage.libraryMetadata,
  stage.persist,
  stage.person,
]

export async function runPipeline(
  ctx: PipelineContext,
  jobs: MediaJob[],
  stageList: PipelineStage[] = stages,
) {
  const limit = pLimit(availableParallelism())
  let processed = 0

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        for await (const stage of stageList) {
          const errorsBefore = job.errors.length
          const result = await runStage(ctx, job, stage)

          if (job.errors.length > errorsBefore) {
            ctx.logger.error(`Stage failed: ${stage.name}`, {
              jobId: job.data.id,
              file: job.file.path,
              errors: job.errors.slice(errorsBefore).map((err) => err.message),
            })
            continue
          }

          if (result) {
            Object.assign(job.data, result)

            ctx.logger.log(`${stage.name} stage complete`, {
              file: job.file.path,
              fields: Object.keys(result),
            })
          }
        }

        processed += 1
        ctx.onJobComplete?.(processed, job.file.path)
      }),
    ),
  )
}

export type PipelineContext = {
  db: LibSQLDatabase
  libraryId: string
  logger: Logger
  onJobComplete?: (processed: number, currentFile: string) => void
}

export type MediaJobData = Partial<
  Omit<
    MediaItem,
    'createdAt' | 'updatedAt' | 'filePath' | 'fileSize' | 'scannedAt' | 'id'
  >
> & {
  id: string
}

export type PipelineStage = {
  name: string
  run(
    ctx: PipelineContext,
    job: MediaJob,
  ): Promise<Partial<MediaJobData> | undefined>
  retry?: number
  timeoutMs?: number
}

export type MediaJob = {
  id: string
  type: 'new' | 'changed' | 'refresh'
  file: FileEntry
  libraryId: string
  libraryType: LibraryType
  mediaTypes: string[]
  dataSourcePath: string

  // mutable state through pipeline
  data: MediaJobData

  // mutable state through pipeline
  // libraryId?: string
  // mediaCategory?: MediaCategory
  // mimeType?: string
  // mediaItemId?: string
  // metadata?: Metadata
  // drmProtected?: boolean

  errors: Error[]
}

async function runStage(
  ctx: PipelineContext,
  job: MediaJob,
  stage: PipelineStage,
) {
  try {
    return withRetry(() => stage.run(ctx, job), stage.retry ?? 0)
  } catch (err) {
    job.errors.push(err as Error)
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === retries) throw err
    }
  }
  throw lastErr
}
