import type { MetadataSourcePlugin } from '@xon/plugin-sdk'
import {
  getPluginsByCategory,
  type PluginEntry,
} from '../../plugins/pluginManager.ts'
import type { ItemPipelineStage, PipelineStage } from '../pipeline.ts'

export default {
  name: 'plugin',
  retry: 1,
  run: async (ctx, job) => {
    const { plugins, matchedProvider } = getMetadataPlugins(job)

    ctx.logger.debug(
      `Matched metadata plugins: [${plugins.map((p) => p.manifest.id).join(', ') ?? 'none'}] for file: ${job.file.path}`,
    )

    return {
      metadata: {},
    }
  },
} satisfies PipelineStage

type MetadataPlugin = PluginEntry<MetadataSourcePlugin>
type MetadataPluginSelection = {
  plugins: MetadataPlugin[]
  matchedProvider?: MetadataPlugin | undefined
}

function getMetadataPlugins(
  job: Parameters<ItemPipelineStage['run']>[1],
): MetadataPluginSelection {
  const plugins = getPluginsByCategory<MetadataSourcePlugin>(
    'MetadataSource',
  ).filter((plugin) => plugin.manifest.contentTypes.includes(job.contentType))

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
