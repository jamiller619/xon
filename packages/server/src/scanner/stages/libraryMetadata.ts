import path from 'node:path'
import type { MetadataSearchQuery, MetadataSourcePlugin } from '@xon/plugin-sdk'
import { LibraryType, type MediaType } from '@xon/shared'
import { normalizeMediaTitle } from '../../media/filenameParser.ts'
import { mergeMetadata } from '../../media/metadataMerge.ts'
import {
  getPluginsByCategory,
  type PluginEntry,
} from '../../plugins/pluginManager.js'
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

    const { plugins, matchedProvider } = getMetadataPlugins(job)

    ctx.logger.log(
      `Matched metadata plugins: [${plugins.map((p) => p.manifest.id).join(', ') ?? 'none'}] for file: ${job.file.path}`,
    )

    const data: MediaJobData = { ...job.data }
    data.metadata ??= {}
    if (matchedProvider && !data.matchIdSource) {
      data.matchIdSource = matchedProvider.manifest.id
    }
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

        const pluginMeta =
          plugin === matchedProvider && data.matchId
            ? await plugin.instance.resolveMatch(
                data.matchId,
                makeSearchQuery(job, data),
              )
            : await plugin.instance.enrich(relativePath, job.libraryType, {
                title: data.title,
                fileMetadata: data.fileMetadata,
                metadata: data.metadata,
              })

        if (pluginMeta) {
          ctx.logger.log(`Plugin metadata for ${job.file.path}`, {
            plugin: plugin.manifest.id,
            title: 'title' in pluginMeta ? pluginMeta.title : undefined,
            fields: Object.keys(pluginMeta),
          })

          data.title = 'title' in pluginMeta ? pluginMeta.title : data.title

          if (job.type !== 'refresh' || !data.matchId) {
            if ('tmdbId' in pluginMeta && pluginMeta.tmdbId != null) {
              data.matchId = String(pluginMeta.tmdbId)
              data.matchIdSource = plugin.manifest.id
            } else if ('imdbId' in pluginMeta && pluginMeta.imdbId != null) {
              data.matchId = pluginMeta.imdbId
              data.matchIdSource = plugin.manifest.id
            } else if ('imdbID' in pluginMeta && pluginMeta.imdbID != null) {
              data.matchId = pluginMeta.imdbID
              data.matchIdSource = plugin.manifest.id
            }
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

type MetadataPlugin = PluginEntry<MetadataSourcePlugin>
type MetadataPluginSelection = {
  plugins: MetadataPlugin[]
  matchedProvider?: MetadataPlugin | undefined
}

function getMetadataPlugins(
  job: Parameters<PipelineStage['run']>[1],
): MetadataPluginSelection {
  const plugins = getPluginsByCategory<MetadataSourcePlugin>(
    'MetadataSource',
  ).filter((plugin) => plugin.manifest.libraryTypes.includes(job.libraryType))

  const storedMatchSource =
    job.data.matchIdSource ??
    (job.data.matchId ? inferMatchSource(job.data.matchId) : undefined)

  const matchedProvider =
    job.type === 'refresh' && job.data.matchId && storedMatchSource
      ? plugins.find((plugin) =>
          providerMatchesSource(plugin, storedMatchSource),
        )
      : undefined

  return {
    plugins: matchedProvider
      ? [
          matchedProvider,
          ...plugins.filter((plugin) => plugin !== matchedProvider),
        ]
      : plugins,
    matchedProvider,
  }
}

function makeSearchQuery(
  job: Parameters<PipelineStage['run']>[1],
  data: MediaJobData,
): MetadataSearchQuery {
  const year = Number(data.fileMetadata?.year ?? data.metadata?.year)
  return {
    title: data.title ?? '',
    ...(Number.isFinite(year) && year > 0 ? { year } : {}),
    libraryType: job.libraryType,
    mediaType: job.file.mediaType.split('/')[0] as MediaType.MainType,
    limit: 10,
    fileMetadata: data.fileMetadata,
  }
}

function providerMatchesSource(
  plugin: MetadataPlugin,
  source: string,
): boolean {
  const pluginId = plugin.manifest.id.toLowerCase()
  const normalizedSource = source.toLowerCase()
  if (pluginId === normalizedSource) return true

  return (
    (normalizedSource === 'tmdb' && pluginId.includes('tmdb')) ||
    (normalizedSource === 'imdb' &&
      (pluginId.includes('omdb') || pluginId.includes('imdb')))
  )
}

function inferMatchSource(matchId: string): string | undefined {
  if (/^tt\d+$/i.test(matchId)) return 'imdb'
  if (/^\d+$/.test(matchId)) return 'tmdb'
}
