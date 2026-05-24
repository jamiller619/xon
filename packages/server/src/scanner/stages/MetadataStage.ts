import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import { getPluginsByCategory } from '../../plugins/pluginManager.ts'
import type { PipelineStage } from '../pipeline.ts'
import { parseMeta } from '../stages.ts'

export default {
  name: 'Metadata Stage',
  retry: 1,
  run: async (_, job) => {
    if (!job.mediaCategories) {
      job.errors.push(new Error('Missing media category'))

      return
    }

    if (job.type === 'changed') return

    const metadataPlugins =
      getPluginsByCategory<MetadataSourcePlugin>('MetadataSource')
    const plugins = metadataPlugins.filter((p) =>
      p.manifest.mediaCategories?.some((c) => job.mediaCategories.includes(c)),
    )

    const meta = {
      ...job.data.metadata,
    }
    const newMeta = await parseMeta(job.entry, job.mediaCategories)

    Object.assign(meta, newMeta)

    for await (const plugin of plugins) {
      for await (const mediaCategory of job.mediaCategories) {
        try {
          const pluginMeta = await plugin.instance.enrich(
            job.entry.filePath,
            mediaCategory,
          )

          if (pluginMeta) {
            Object.assign(meta, pluginMeta)
          }
        } catch (err) {
          job.errors.push(err as Error)
        }
      }
    }

    return {
      metadata: meta,
    }
  },
} satisfies PipelineStage
