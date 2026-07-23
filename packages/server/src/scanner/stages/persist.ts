import { and, eq } from 'drizzle-orm'
import { mediaItems } from '../../db/schema.ts'
import type { MediaJob, PipelineContext, PipelineStage } from '../pipeline.ts'

export default {
  name: 'persist',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'new') return saveNewMediaItem(ctx, job)
    if (job.type === 'changed') return saveChangedMediaItem(ctx, job)
    if (job.type === 'refresh') return saveRefreshedMediaItem(ctx, job)
  },
} satisfies PipelineStage

async function saveChangedMediaItem(ctx: PipelineContext, job: MediaJob) {
  const [mediaItem] = await ctx.db
    .select()
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.filePath, job.file.path),
        eq(mediaItems.libraryId, job.libraryId),
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

  return mediaItem
}

async function saveRefreshedMediaItem(ctx: PipelineContext, job: MediaJob) {
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
  await ctx.db.transaction(async (tx) => {
    if (job.data.drmProtected == null || !job.data.title) {
      ctx.logger.error('Persist stage: missing required fields', {
        file: job.file.path,
        jobId: job.data.id,
        missing: [
          job.data.drmProtected == null ? 'drmProtected' : null,
          !job.data.title ? 'title' : null,
        ].filter(Boolean),
      })

      return
    }

    await tx.insert(mediaItems).values({
      id: job.data.id,
      libraryId: job.libraryId,
      matchId: job.data.matchId,
      matchIdSource: job.data.matchIdSource,
      filePath: job.file.path,
      fileSize: job.file.size,
      fileMetadata: job.data.fileMetadata ?? {},
      mediaType: job.data.mediaType ?? job.file.mediaType,
      metadata: job.data.metadata ?? {},
      drmProtected: job.data.drmProtected,
      title: job.data.title,
      description: job.data.description,
      scannedAt: new Date(),
    })
  })

  return {
    id: job.data.id,
  }
}
