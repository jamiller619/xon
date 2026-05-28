import { MediaCategory } from '@xon/shared'
import { parseFilename } from '../../media/filenameParser.ts'
import type { PipelineStage } from '../pipeline.js'

export default {
  name: 'title',
  retry: 1,
  run: async (_, job) => {
    const isTvShow = job.mediaCategories.includes(MediaCategory.TVShows)

    const { title, metadata } = parseFilename(job.file.path, isTvShow)

    return {
      title,
      metadata,
    }
  },
} satisfies PipelineStage
