import path from 'node:path'
import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import { LibraryType } from '@xon/shared'
import { normalizeMediaTitle } from '../../media/filenameParser.ts'
import { mergeMetadata } from '../../media/metadataMerge.ts'
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
    const storedMetadata = data.metadata
    let refreshedMetadata = {}

    if (
      typeof data.title === 'string' &&
      (job.libraryType === LibraryType.Movies ||
        job.libraryType === LibraryType.TVShows)
    ) {
      const normalizedTitle = normalizeMediaTitle(
        data.title,
        path.extname(job.file.path),
      )
      if (normalizedTitle) data.title = normalizedTitle
    }

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

          // Preserve arrays from higher-priority providers while adding new
          // values from later providers. Duplicate values are removed so
          // repeated refreshes remain idempotent.
          refreshedMetadata = mergeMetadata(refreshedMetadata, pluginMeta)
          data.metadata = mergeMetadata(storedMetadata, refreshedMetadata, {
            incomingArraysFirst: true,
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
