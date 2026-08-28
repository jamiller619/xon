import { deriveMediaTags } from '@xon/shared'
import type { PipelineStage } from '../pipeline.ts'

export default {
  name: 'tags',
  async run(_, job) {
    return {
      tags: deriveMediaTags({
        metadata: job.data.metadata,
        fileMetadata: job.data.fileMetadata,
        existingTags: job.data.tags,
      }),
    }
  },
} satisfies PipelineStage
