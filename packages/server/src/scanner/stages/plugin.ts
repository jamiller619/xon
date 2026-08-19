import type { PipelineStage } from '../pipeline.ts'

export default {
  name: 'plugin',
  retry: 1,
  run: async (ctx, job) => {
    return {
      metadata: {},
    }
  },
} satisfies PipelineStage
