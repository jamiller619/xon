import { MediaCategory } from '@xon/shared'
import { generateThumbnails } from '../../media/thumbnails.ts'
import type { PipelineStage } from '../pipeline.ts'

export default {
  name: 'thumbnails',
  retry: 1,
  async run(_, job) {
    if (job.type === 'changed') return
    if (!job.data.id) {
      job.errors.push(new Error('Missing media item id'))

      return
    }

    if (job.mediaCategories.includes(MediaCategory.Pictures)) {
      const thumbs = await generateThumbnails(job.file.path, job.data.id)

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
} satisfies PipelineStage
