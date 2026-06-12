import { availableParallelism } from 'node:os'
import type { MediaItem, MediaType, Metadata } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import pLimit from 'p-limit'
import type { Logger } from '../logger.ts'
import type { FileEntry } from './fileEntry.ts'

export type PipelineContext = {
  db: LibSQLDatabase
  libraryId: string
  logger: Logger
  onJobComplete?: (processed: number, currentFile: string) => void
}

export type MediaJobItem = Partial<
  Exclude<
    MediaItem,
    'createdAt' | 'updatedAt' | 'filePath' | 'fileSize' | 'scannedAt'
  >
>

export type PipelineStage = {
  name: string
  run(ctx: PipelineContext, job: MediaJob): Promise<MediaJobItem | undefined>
  retry?: number
  timeoutMs?: number
}

export type MediaJob = {
  id: string
  type: 'new' | 'changed'
  file: FileEntry
  mediaTypes: MediaType.MainType[]

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
  concurrency = availableParallelism(),
) {
  const limit = pLimit(concurrency)
  let processed = 0

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        for await (const stage of stages) {
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
          }
        }

        processed += 1
        ctx.onJobComplete?.(processed, job.file.path)
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
