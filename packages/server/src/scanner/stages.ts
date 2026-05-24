import { MediaCategory, type Metadata } from '@xon/shared'
import { eq } from 'drizzle-orm'
import { mediaItems } from '../db/schema.ts'
import { detectDrm } from '../media/drm.ts'
import { extractExiftoolMetadata } from '../media/exiftool.ts'
import { extractFfprobeMetadata } from '../media/ffprobe.ts'
import { parseFilename } from '../media/filenameParser.ts'
import { extractMusicTags } from '../media/musictags.ts'
import { generateThumbnails } from '../media/thumbnails.ts'
import type { FileEntry } from './fileEntry.ts'
import type {
  MediaJob,
  MediaJobItem,
  PipelineContext,
  PipelineStage,
} from './pipeline.ts'

export const DRMStage: PipelineStage = {
  name: 'drm',
  retry: 1,
  async run(_, job) {
    return {
      drmProtected: await detectDrm(job.entry.filePath),
    }
  },
}

export const TitleStage: PipelineStage = {
  name: 'title',
  retry: 1,
  async run(_, job) {
    const isTvShow = job.mediaCategories.includes(MediaCategory.TVShows)

    const { title, metadata } = parseFilename(job.entry.filePath, isTvShow)

    return {
      title,
      metadata,
    }
  },
}

export const PersistStage: PipelineStage = {
  name: 'persist',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'new') return saveNewMediaItem(ctx, job)
    if (job.type === 'changed') return saveChangedMediaItem(ctx, job)
  },
}

async function saveChangedMediaItem(
  ctx: PipelineContext,
  job: MediaJob,
): Promise<MediaJobItem | undefined> {
  const [mediaItem] = await ctx.db
    .select({ id: mediaItems.id, metadata: mediaItems.metadata })
    .from(mediaItems)
    .where(eq(mediaItems.filePath, job.entry.filePath))

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
  if (!ctx.libraryId || job.data.drmProtected == null || !job.data.title) {
    ctx.logger.error('Missing required fields: ', ctx, job.data)
    job.errors.push(new Error('Persist stage: Missing required fields'))

    return
  }

  const [result] = await ctx.db
    .insert(mediaItems)
    .values({
      libraryId: ctx.libraryId,
      filePath: job.entry.filePath,
      fileSize: job.entry.fileSize,
      mimeType: job.data.mimeType ?? job.entry.mimeType,
      metadata: job.data.metadata,
      drmProtected: job.data.drmProtected,
      title: job.data.title,
      scannedAt: new Date(),
    })
    .returning({
      id: mediaItems.id,
    })

  if (!result) {
    job.errors.push(new Error('Persist stage: Failed to insert media item'))

    return
  }

  return {
    id: result.id,
  }
}

export const ThumbnailStage: PipelineStage = {
  name: 'thumbnails',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'changed') return
    if (!job.data.id) {
      job.errors.push(new Error('Missing media item id'))

      return
    }

    if (job.mediaCategories.includes(MediaCategory.Pictures)) {
      const thumbs = await generateThumbnails(
        job.entry.filePath,
        job.data.id,
        ctx.dataDir,
      )

      if (thumbs) {
        const data = [thumbs.large, thumbs.medium, thumbs.small]
        const filtered = data.filter(Boolean)

        if (filtered.length) {
          return {
            metadata: {
              images: {
                ...job.data.metadata.images,
                thumbnail: filtered,
              },
            },
          }
        }
      }
    }
  },
}

export async function parseMeta(
  entry: FileEntry,
  mediaCategories: MediaCategory[],
): Promise<Metadata | undefined> {
  const data = {}

  for await (const mediaCategory of mediaCategories) {
    switch (mediaCategory) {
      case MediaCategory.Music:
        Object.assign(data, await extractMusicTags(entry.filePath))
        break

      case MediaCategory.Movies:
      case MediaCategory.TVShows:
      case MediaCategory.HomeVideos:
        Object.assign(data, await extractFfprobeMetadata(entry.filePath))
        break

      case MediaCategory.Pictures:
        Object.assign(data, await extractExiftoolMetadata(entry.filePath))
        break
    }
  }

  return data
}
