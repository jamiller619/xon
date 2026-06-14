import { eq } from 'drizzle-orm'
import { libraryMediaItems, mediaItems } from '../../db/schema.ts'
import type {
  MediaJob,
  MediaJobItem,
  PipelineContext,
  PipelineStage,
} from '../pipeline.ts'

export default {
  name: 'persist',
  retry: 1,
  async run(ctx, job): Promise<MediaJobItem | undefined> {
    if (job.type === 'new') return saveNewMediaItem(ctx, job)
    if (job.type === 'changed') return saveChangedMediaItem(ctx, job)
  },
} satisfies PipelineStage

async function saveChangedMediaItem(
  ctx: PipelineContext,
  job: MediaJob,
): Promise<MediaJobItem | undefined> {
  const [mediaItem] = await ctx.db
    .select({ id: mediaItems.id, metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(eq(mediaItems.filePath, job.file.path))

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

async function saveNewMediaItem(
  ctx: PipelineContext,
  job: MediaJob,
): Promise<MediaJobItem | undefined> {
  await ctx.db.transaction(async (tx) => {
    if (job.data.drmProtected == null || !job.data.title) {
      ctx.logger.error('Missing required fields: ', ctx, job.data)

      return
    }

    await tx.insert(mediaItems).values({
      id: job.data.id,
      filePath: job.file.path,
      fileSize: job.file.size,
      mediaType: job.data.mediaType ?? job.file.mediaType,
      metadata: job.data.metadata,
      drmProtected: job.data.drmProtected,
      title: job.data.title,
      description: job.data.description,
      scannedAt: new Date(),
    })

    await tx.insert(libraryMediaItems).values({
      libraryId: ctx.libraryId,
      mediaItemId: job.data.id,
    })
  })

  return {
    id: job.data.id,
  }
}
