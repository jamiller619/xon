import { LibraryType } from '@xon/shared'
import { parseFilename } from '../../media/filenameParser.ts'
import type { PipelineStage } from '../pipeline.js'

export default {
  name: 'title',
  retry: 1,
  run: async (_, job) => {
    if (job.data.title) return

    const { title, metadata } = parseFilename(
      job.file.path,
      job.libraryType === LibraryType.TVShows,
    )

    return {
      title,
      fileMetadata: metadata,
    }
  },
} satisfies PipelineStage
