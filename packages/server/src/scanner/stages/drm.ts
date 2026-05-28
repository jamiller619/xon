import { detectDrm } from '../../media/drm.ts'
import type { PipelineStage } from '../pipeline.ts'

export default {
  name: 'drm',
  retry: 1,
  run: async (_, job) => {
    return {
      drmProtected: await detectDrm(job.file.path),
    }
  },
} satisfies PipelineStage
