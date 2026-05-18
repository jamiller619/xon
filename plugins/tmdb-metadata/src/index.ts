import {
  MetadataSourcePlugin,
  type PluginContext,
  type PluginManifest,
} from '@xon/plugin-sdk'
import { MediaCategory } from '@xon/shared'
import { parseMediaTitle } from './titleParser.js'
import { TmdbClient } from './tmdbClient.js'

export default class TmdbMetadataPlugin extends MetadataSourcePlugin {
  override readonly manifest: PluginManifest = {
    id: 'tmdb-metadata',
    name: 'TMDb Metadata',
    version: '1.0.0',
    description:
      'Fetches movie and TV show metadata from The Movie Database (TMDb)',
    author: 'Xon',
    category: 'MetadataSource',
    mediaCategories: [MediaCategory.Movies, MediaCategory.TVShows],
    main: 'dist/index.js',
    permissions: {
      network: ['api.themoviedb.org'],
    },
  }

  #client: TmdbClient | null = null
  #ctx: PluginContext | null = null

  override async init(context: PluginContext): Promise<void> {
    this.#ctx = context

    const apiKey = process.env.TMDB_API_KEY

    if (!apiKey) {
      context.logger.warn(
        'TMDB_API_KEY not set — TMDb metadata enrichment disabled',
      )
      return
    }

    this.#client = new TmdbClient(apiKey, context.fetch)
  }

  override async enrich(filePath: string, category: MediaCategory) {
    const parsed = parseMediaTitle(filePath)

    try {
      if (parsed.type === 'movie' && category === MediaCategory.Movies) {
        return this.#client?.fetchMovieMetadata(parsed.title, parsed.year)
      }

      if (parsed.type === 'tv' && category === MediaCategory.TVShows) {
        return this.#client?.fetchTvMetadata(
          parsed.seriesTitle,
          parsed.season,
          parsed.episode,
        )
      }
    } catch (err) {
      this.#ctx?.logger.error(
        `TMDb: enrichment failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
