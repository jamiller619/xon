import path from 'node:path'
import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import deepmerge from 'deepmerge'
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
    data.metadata ??= {}

    for await (const plugin of plugins) {
      try {
        const relativePath = path.relative(job.dataSourcePath, job.file.path)

        const pluginMeta = await plugin.instance.enrich(
          relativePath,
          job.libraryType,
          {
            title: data.title,
            fileMetadata: data.fileMetadata,
            metadata: data.metadata,
          },
        )

        if (pluginMeta) {
          ctx.logger.log(`Plugin metadata for ${job.file.path}`, {
            plugin: plugin.manifest.id,
            title: 'title' in pluginMeta ? pluginMeta.title : undefined,
            fields: Object.keys(pluginMeta),
          })

          data.title = 'title' in pluginMeta ? pluginMeta.title : data.title

          if ('tmdbId' in pluginMeta && pluginMeta.tmdbId != null) {
            data.matchId = String(pluginMeta.tmdbId)
            data.matchIdSource = 'tmdb'
          } else if ('imdbId' in pluginMeta && pluginMeta.imdbId != null) {
            data.matchId = pluginMeta.imdbId
            data.matchIdSource = 'imdb'
          } else if ('imdbID' in pluginMeta && pluginMeta.imdbID != null) {
            data.matchId = pluginMeta.imdbID
            data.matchIdSource = 'imdb'
          }

          // Deep-merge so a plugin returning a partial nested object (e.g.
          // OMDb's `images.poster`) can't clobber another plugin's entries
          // (e.g. TMDb's `images.backdrop`). Arrays are replaced, not
          // concatenated, so list fields like `genres` don't accumulate
          // duplicates across plugins.
          data.metadata = deepmerge(data.metadata, pluginMeta, {
            arrayMerge: (_target, source) => source,
          })
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
