import type { ContentType } from '@xon/shared'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../logger.ts'
import {
  type FinalPipelineStage,
  type ItemPipelineStage,
  type MediaJob,
  type PipelineContext,
  runPipeline,
} from './pipeline.ts'

vi.mock('node:os', () => ({ availableParallelism: () => 4 }))

const logger: Logger = {
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

function context(): PipelineContext {
  return {
    db: {} as LibSQLDatabase,
    libraryId: 1,
    libraryPublicId: 'library-1',
    contentType: 'audio' as ContentType,
    logger,
  }
}

function job(id = 'job-1'): MediaJob {
  const now = new Date()
  const filePath = `/music/${id}.mp3`
  return {
    id,
    type: 'new',
    file: {
      id: filePath,
      path: filePath,
      name: `${id}.mp3`,
      size: 1,
      createdAt: now,
      modifiedAt: now,
      ext: '.mp3',
      mediaType: 'audio/mpeg',
    },
    libraryId: 1,
    libraryPublicId: 'library-1',
    contentType: 'audio' as ContentType,
    mediaTypes: [],
    dataSourcePath: '/music',
    dataSourceId: 'source-1',
    data: { publicId: `media-${id}` },
    errors: [],
  }
}

describe('runPipeline final stages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs a final stage after every item reaches the item stages', async () => {
    const events: string[] = []
    const itemStage: ItemPipelineStage = {
      name: 'item',
      async run(_, mediaJob) {
        events.push(`item:${mediaJob.id}`)
      },
    }
    const finalStage: FinalPipelineStage = {
      name: 'final',
      async runAfterAll(_, jobs) {
        events.push(`final:${jobs.length}`)
      },
    }

    await runPipeline(context(), [job()], [itemStage, finalStage])

    expect(events).toEqual(['item:job-1', 'final:1'])
  })

  it('runs final stages even when there are no media jobs', async () => {
    const finalStage: FinalPipelineStage = {
      name: 'final',
      runAfterAll: vi.fn(async () => undefined),
    }

    await runPipeline(context(), [], [finalStage])

    expect(finalStage.runAfterAll).toHaveBeenCalledOnce()
  })

  it('logs pipeline and stage timing summaries at info level', async () => {
    const itemStage: ItemPipelineStage = {
      name: 'metadata',
      async run() {
        return { title: 'Song' }
      },
    }
    const finalStage: FinalPipelineStage = {
      name: 'musicFolderAssets',
      async runAfterAll() {},
    }

    await runPipeline(context(), [job()], [itemStage, finalStage])

    expect(logger.info).toHaveBeenCalledWith(
      'Scan pipeline started',
      expect.objectContaining({
        libraryId: 'library-1',
        jobs: 1,
        stages: ['metadata', 'musicFolderAssets'],
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'Final scan stage finished',
      expect.objectContaining({
        stage: 'musicFolderAssets',
        failed: false,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'Scan pipeline finished',
      expect.objectContaining({
        processedFiles: 1,
        totalFiles: 1,
        stageTimings: expect.objectContaining({
          metadata: expect.objectContaining({ calls: 1, failedCalls: 0 }),
          musicFolderAssets: expect.objectContaining({
            calls: 1,
            failedCalls: 0,
          }),
        }),
      }),
    )
  })

  it('serializes stages with a concurrency limit of one', async () => {
    let active = 0
    let maxActive = 0
    const persistStage: ItemPipelineStage = {
      name: 'persist',
      concurrency: 1,
      async run() {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      },
    }

    await runPipeline(
      context(),
      [job('job-1'), job('job-2'), job('job-3'), job('job-4')],
      [persistStage],
    )

    expect(maxActive).toBe(1)
  })

  it('retries matching stage errors with bounded backoff', async () => {
    let attempts = 0
    const busyError = Object.assign(new Error('database is locked'), {
      code: 'SQLITE_BUSY',
    })
    const persistStage: ItemPipelineStage = {
      name: 'persist',
      retry: 2,
      retryDelayMs: 1,
      shouldRetry: (error) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'SQLITE_BUSY',
      async run() {
        attempts += 1
        if (attempts < 3) throw busyError
        return { title: 'Persisted' }
      },
    }
    const mediaJob = job()

    await runPipeline(context(), [mediaJob], [persistStage])

    expect(attempts).toBe(3)
    expect(mediaJob.errors).toEqual([])
    expect(mediaJob.data.title).toBe('Persisted')
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('captures rejected stage promises as job errors', async () => {
    const mediaJob = job()
    const failingStage: ItemPipelineStage = {
      name: 'persist',
      retry: 0,
      async run() {
        throw new Error('SQLITE_BUSY: database is locked')
      },
    }

    await runPipeline(context(), [mediaJob], [failingStage])

    expect(mediaJob.errors.map((error) => error.message)).toEqual([
      'SQLITE_BUSY: database is locked',
    ])
    expect(logger.error).toHaveBeenCalledWith(
      'Stage failed: persist',
      expect.objectContaining({
        errors: ['SQLITE_BUSY: database is locked'],
      }),
    )
  })

  it('drains every scheduled job before propagating an unexpected failure', async () => {
    const completedFiles: string[] = []
    const pipelineContext = context()
    pipelineContext.onJobComplete = (_, filePath) => {
      if (filePath.endsWith('job-1.mp3')) {
        throw new Error('progress callback failed')
      }
      completedFiles.push(filePath)
    }
    const itemStage: ItemPipelineStage = {
      name: 'item',
      async run(_, mediaJob) {
        if (mediaJob.id === 'job-2') {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      },
    }

    await expect(
      runPipeline(pipelineContext, [job('job-1'), job('job-2')], [itemStage]),
    ).rejects.toThrow('1 scan pipeline job failed unexpectedly')
    expect(completedFiles).toEqual(['/music/job-2.mp3'])
  })
})
