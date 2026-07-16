import { and, eq } from 'drizzle-orm'
import { mediaItems } from '../../db/schema.ts'
import type { MediaJob, PipelineContext, PipelineStage } from '../pipeline.ts'

export default {
  name: 'persist',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'new') return saveNewMediaItem(ctx, job)
    if (job.type === 'changed') return saveChangedMediaItem(ctx, job)
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
    ctx.logger.log(
      `Persist stage: Updating metadata for media item ${mediaItem.id}`,
    )
    await ctx.db
      .update(mediaItems)
      .set({ metadata: combinedMetadata })
      .where(eq(mediaItems.id, mediaItem.id))
  }

  return mediaItem
}

async function saveNewMediaItem(ctx: PipelineContext, job: MediaJob) {
  await ctx.db.transaction(async (tx) => {
    if (job.data.drmProtected == null || !job.data.title) {
      ctx.logger.error('Missing required fields: ', ctx, job.data)

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
