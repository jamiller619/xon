import path from 'node:path'
import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import { getPluginsByCategory } from '../../plugins/pluginManager.js'
import type { MediaJobData, PipelineStage } from '../pipeline.js'

export default {
  name: 'metadata',
  retry: 1,
  run: async (ctx, job) => {
    if (job.type === 'changed') {
      if (Object.keys(job.data.metadata ?? {}).length > 0) {
        ctx.logger.log(
          `Skipping metadata stage with existing data for changed file: ${job.file.path}`,
        )

        return
      }
    }

    const plugins = getPluginsByCategory<MetadataSourcePlugin>(
      'MetadataSource',
    ).filter((p) => p.manifest.libraryTypes.includes(job.libraryType))

    ctx.logger.log(
      `Matched metadata plugins: [${plugins.map((p) => p.manifest.id).join(', ') ?? 'none'}] for file: ${job.file.path}`,
    )

    const data: MediaJobData = { ...job.data }

    for await (const plugin of plugins) {
      try {
        const relativePath = path.relative(job.dataSourcePath, job.file.path)

        const pluginMeta = await plugin.instance.enrich(
          relativePath,
          job.libraryType,
        )

        if (pluginMeta) {
          ctx.logger.log(
            `Plugin metadata for ${job.file.path}: ${JSON.stringify(pluginMeta, null, 2)}`,
          )

          data.title = 'title' in pluginMeta ? pluginMeta.title : data.title
          data.metadata ??= {}

          Object.assign(data.metadata, pluginMeta)
        }
      } catch (err) {
        job.errors.push(err as Error)
      }
    }

    return {
      ...data,
    }
  },
} satisfies PipelineStage
