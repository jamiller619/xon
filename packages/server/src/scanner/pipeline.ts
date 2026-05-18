import type { MediaCategory, MediaItem, Metadata } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import pLimit from 'p-limit'
import type { Logger } from '../logger.js'
import type { FileEntry } from './fileEntry.js'

export type PipelineContext = {
  db: LibSQLDatabase
  libraryId: string
  dataDir: string
  logger: Logger
}

export type MediaJobItem = Partial<
  Exclude<
    MediaItem,
    'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'fileSize' | 'scannedAt'
  >
>

export type PipelineStage = {
  name: string
  run(ctx: PipelineContext, job: MediaJob): Promise<MediaJobItem | undefined>
  retry?: number
  timeoutMs?: number
}

export type MediaJob = {
  // The ID of the job, NOT the media item!
  id: string
  type: 'new' | 'changed'
  entry: FileEntry

  // mediaItemId?: string
  mediaCategories: MediaCategory[]

  // mutable state through pipeline
  data: MediaJobItem & {
    metadata: Metadata
  }

  // mutable state through pipeline
  // libraryId?: string
  // mediaCategory?: MediaCategory
  // mimeType?: string
  // mediaItemId?: string
  // metadata?: Metadata
  // drmProtected?: boolean

  errors: Error[]
}

export async function runPipeline(
  ctx: PipelineContext,
  jobs: MediaJob[],
  stages: PipelineStage[],
  concurrency = 5,
) {
  const limit = pLimit(concurrency)

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        for await (const stage of stages) {
          const result = await runStage(ctx, job, stage)

          if (job.errors.length > 0) {
            ctx.logger.error(`Stage failed: ${stage.name}`, {
              jobId: job.id,
              errors: job.errors.map((err) => err.message),
            })

            continue
          }

          ctx.logger.log(`Stage completed: ${stage.name}`, {
            jobId: job.id,
            result,
          })

          if (result) {
            Object.assign(job.data, result)
          }
        }
      }),
    ),
  )
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
