import fsp from 'node:fs/promises'
import path from 'node:path'
import { LibraryType, type Metadata } from '@xon/shared'
import { eq } from 'drizzle-orm'
import mime from 'mime-types'
import config from '../../config.ts'
import { mediaItems } from '../../db/schema.ts'
import { extractAlbumArt } from '../../media/musictags.ts'
import {
  generateThumbnails,
  type ThumbnailPaths,
  writeThumbnailImages,
} from '../../media/thumbnails.ts'
import { generateVideoThumbnails } from '../../media/videoThumbnails.ts'
import type { MediaJob, PipelineStage } from '../pipeline.ts'
import { isAudio, isImage, isVideo } from './shared.ts'

export default {
  name: 'thumbnails',
  retry: 1,
  async run(ctx, job) {
    if (job.type === 'changed') return
    if (!job.data.id) {
      job.errors.push(
        new Error('Missing required media item id for thumbnails job'),
      )

      return undefined
    }

    // Movies and TV shows get artwork from metadata plugins; only
    // generate our own when nothing was found.
    const isMovieOrShow =
      job.libraryType === LibraryType.Movies ||
      job.libraryType === LibraryType.TVShows

    if (isMovieOrShow && hasImages(job.data.metadata)) return

    const images: Record<string, string | string[]> = {
      ...job.data.metadata?.images,
    }

    let thumbs: ThumbnailPaths | undefined

    if (isAudio(job.file.mediaType)) {
      const cover = await saveEmbeddedArt(job)

      if (!cover) return

      images.poster = cover.posterPath
      thumbs = cover.thumbs
    } else if (isImage(job.file.mediaType)) {
      thumbs = await generateThumbnails(job.file.path, job.data.id)
    } else if (isVideo(job.file.mediaType)) {
      thumbs = await generateVideoThumbnails(job.file.path, job.data.id)
    } else {
      return
    }

    if (thumbs) {
      images.thumbnail = [thumbs.large, thumbs.medium, thumbs.small]
    }

    if (Object.keys(images).length < 1) return

    const metadata = {
      ...job.data.metadata,
      images,
    }

    // persist already wrote this row; update it with the new artwork
    await ctx.db
      .update(mediaItems)
      .set({ metadata })
      .where(eq(mediaItems.id, job.data.id))

    return { metadata }
  },
} satisfies PipelineStage

function hasImages(metadata: Metadata | undefined): boolean {
  const images = metadata?.images as
    | Record<string, string | string[]>
    | undefined

  if (!images) return false

  return Object.values(images).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )
}

/**
 * Extract the cover art embedded in the file's tags, save the full-size
 * image to the shared images directory and generate thumbnails from it.
 */
async function saveEmbeddedArt(job: MediaJob) {
  const art = await extractAlbumArt(job.file.path)

  if (!art) return

  const buffer = Buffer.from(art.data)
  const imagesDir = path.join(config.get('appdata.path'), 'images')

  await fsp.mkdir(imagesDir, { recursive: true })

  const ext = mime.extension(art.format) || 'jpg'
  const posterPath = path.join(imagesDir, `${job.data.id}_cover.${ext}`)

  await fsp.writeFile(posterPath, buffer)

  const thumbs = await writeThumbnailImages(job.data.id, buffer)

  return { posterPath, thumbs }
}
