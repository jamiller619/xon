// import { generateThumbnails } from '../../media/thumbnails.ts'
import type { MediaJob, MediaJobItem, PipelineStage } from '../pipeline.ts'

export default {
  name: 'thumbnails',
  retry: 1,
  async run(_, job): Promise<MediaJobItem | undefined> {
    if (job.type === 'changed') return
    if (!job.data.id) {
      job.errors.push(
        new Error('Missing required media item id for thumbnails job'),
      )

      return
    }

    // const imageMimeTypes = getMimeTypesForCategory(MediaCategory.Pictures)

    // if (imageMimeTypes.includes(job.file.mimeType)) {
    // }
  },
} satisfies PipelineStage

// async function generateImageThumbnails(job: MediaJob) {
//   const thumbs = await generateThumbnails(job.file.path, job.data.id)

//   if (thumbs) {
//     const data = [thumbs.large, thumbs.medium, thumbs.small]
//     const filtered = data.filter(Boolean)

//     if (filtered.length) {
//       return {
//         metadata: {
//           images: {
//             ...job.data.metadata.images,
//             thumbnail: filtered,
//           },
//         },
//       }
//     }
//   }
// }
