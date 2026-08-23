import { DataSourceType } from '@xon/shared'
import { and, eq } from 'drizzle-orm'
import { mediaItems } from '../../db/schema.ts'
import {
  generatePublicId,
  insertWithGeneratedPublicId,
} from '../../lib/publicId.ts'
import { relativeMediaFilePath } from '../../media/mediaFilePaths.ts'
import type { MediaJob, PipelineContext, PipelineStage } from '../pipeline.ts'

const SQLITE_BUSY_RETRIES = 4
const SQLITE_BUSY_RETRY_DELAY_MS = 100

export default {
  name: 'persist',
  concurrency: 1,
  retry: SQLITE_BUSY_RETRIES,
  retryDelayMs: SQLITE_BUSY_RETRY_DELAY_MS,
  shouldRetry: isSqliteBusyError,
  async run(ctx, job) {
    if (job.type === 'new') return saveNewMediaItem(ctx, job)
    if (job.type === 'changed') return saveChangedMediaItem(ctx, job)
    if (job.type === 'refresh') return saveRefreshedMediaItem(ctx, job)
  },
} satisfies PipelineStage

function isSqliteBusyError(error: unknown): boolean {
  let current = error
  for (let depth = 0; current && depth < 6; depth++) {
    const code =
      typeof current === 'object' && 'code' in current
        ? String(current.code)
        : ''
    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'object' && 'message' in current
          ? String(current.message)
          : String(current)
    if (code.startsWith('SQLITE_BUSY') || message.includes('SQLITE_BUSY')) {
      return true
    }
    current =
      typeof current === 'object' && 'cause' in current
        ? current.cause
        : undefined
  }
  return false
}

async function saveChangedMediaItem(ctx: PipelineContext, job: MediaJob) {
  const storedPath = relativeMediaFilePath(job.file.path, {
    id: job.dataSourceId,
    type: DataSourceType.local,
    path: job.dataSourcePath,
  })
  const [mediaItem] = await ctx.db
    .select()
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.filePath, storedPath),
        eq(mediaItems.dataSourceId, job.dataSourceId),
      ),
    )

  if (!mediaItem) {
    job.errors.push(
      new Error(
        'Persist stage: No matching media item found in database for changed file',
      ),
    )

    return
  }

  // Compare metadata to see if it needs updating
  const combinedMetadata = {
    ...mediaItem.metadata,
    ...job.data.metadata,
  }

  if (JSON.stringify(combinedMetadata) !== JSON.stringify(mediaItem.metadata)) {
    ctx.logger.debug(
      `Persist stage: Updating metadata for media item ${mediaItem.id}`,
    )
    await ctx.db
      .update(mediaItems)
      .set({ metadata: combinedMetadata })
      .where(eq(mediaItems.id, mediaItem.id))
  }

  return {
    id: mediaItem.id,
    publicId: mediaItem.publicId,
    metadata: combinedMetadata,
  }
}

async function saveRefreshedMediaItem(ctx: PipelineContext, job: MediaJob) {
  if (job.data.id == null) {
    job.errors.push(new Error('Persist stage: Refresh job has no internal id'))
    return
  }

  const [mediaItem] = await ctx.db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.id, job.data.id))

  if (!mediaItem) {
    job.errors.push(
      new Error('Persist stage: No media item found for refresh job'),
    )

    return
  }

  // Fresh plugin data wins over stored fields; stored fields the plugins
  // didn't return (e.g. user edits, other sources) are kept.
  const combinedMetadata = {
    ...mediaItem.metadata,
    ...job.data.metadata,
  }

  ctx.logger.debug(
    `Persist stage: Refreshing metadata for media item ${mediaItem.id}`,
  )

  await ctx.db
    .update(mediaItems)
    .set({
      metadata: combinedMetadata,
      title: job.data.title ?? mediaItem.title,
      matchId: job.data.matchId ?? mediaItem.matchId,
      matchIdSource: job.data.matchIdSource ?? mediaItem.matchIdSource,
      scannedAt: new Date(),
    })
    .where(eq(mediaItems.id, mediaItem.id))

  // Person stage runs after this and re-writes metadata from job.data —
  // hand it the merged object so stored-only fields survive.
  return { metadata: combinedMetadata }
}

async function saveNewMediaItem(ctx: PipelineContext, job: MediaJob) {
  if (job.data.drmProtected == null || !job.data.title) {
    ctx.logger.error('Persist stage: missing required fields', {
      file: job.file.path,
      jobId: job.data.id,
      missing: [
        job.data.drmProtected == null ? 'drmProtected' : null,
        !job.data.title ? 'title' : null,
      ].filter(Boolean),
    })

    return undefined
  }
  const drmProtected = job.data.drmProtected
  const title = job.data.title

  const discoveredPublicId = job.data.publicId
  let firstAttempt = true
  const created = await insertWithGeneratedPublicId(
    async (publicId) => {
      const [row] = await ctx.db
        .insert(mediaItems)
        .values({
          publicId,
          libraryId: job.libraryId,
          dataSourceId: job.dataSourceId,
          matchId: job.data.matchId,
          matchIdSource: job.data.matchIdSource,
          filePath: relativeMediaFilePath(job.file.path, {
            id: job.dataSourceId,
            type: DataSourceType.local,
            path: job.dataSourcePath,
          }),
          fileSize: job.file.size,
          fileMetadata: job.data.fileMetadata ?? {},
          mediaType: job.data.mediaType ?? job.file.mediaType,
          metadata: job.data.metadata ?? {},
          drmProtected,
          title,
          description: job.data.description,
          scannedAt: new Date(),
        })
        .returning({ id: mediaItems.id, publicId: mediaItems.publicId })

      if (!row) throw new Error('Failed to create media item')
      job.data.publicId = row.publicId
      return row
    },
    () => {
      if (!firstAttempt) return generatePublicId()
      firstAttempt = false
      return discoveredPublicId
    },
  )

  return created
}
