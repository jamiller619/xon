import {
  type EnrichOptions,
  type MetadataSearchQuery,
  type MetadataSearchResult,
  MetadataSourcePlugin,
  type PluginContext,
} from '@xon/plugin-sdk'
import { LibraryType, MediaType, type Metadata } from '@xon/shared'
import { OmdbClient } from './omdbClient.js'

export type { OmdbRating, OmdbResult } from './omdbClient.js'

export default class OmdbMetadataPlugin extends MetadataSourcePlugin {
  override mediaTypes = [MediaType.MainType.Video]

  #client: OmdbClient | null = null
  #ctx: PluginContext | null = null

  override async init(context: PluginContext): Promise<void> {
    this.#ctx = context

    const apiKey =
      context.settings.get<string>('apiKey') || process.env.OMDB_API_KEY

    if (!apiKey) {
      context.logger.warn(
        'No API key configured (settings or OMDB_API_KEY) — OMDb metadata enrichment disabled',
      )
      return
    }

    this.#client = new OmdbClient(apiKey, context.fetch)
  }

  override getSearchAvailability() {
    return this.#client
      ? { available: true }
      : { available: false, reason: 'OMDb API key is not configured' }
  }

  override async search(
    query: MetadataSearchQuery,
  ): Promise<MetadataSearchResult[]> {
    if (!this.#client) return []
    const type = query.libraryType === LibraryType.TVShows ? 'series' : 'movie'
    const results = await this.#client.searchTitles(query.title, type)

    return results.slice(0, query.limit).map((result) => ({
      id: result.imdbId,
      title: result.title,
      mediaKind: result.type === 'series' ? 'series' : 'movie',
      ...(Number.parseInt(result.year, 10) > 0 && {
        year: Number.parseInt(result.year, 10),
      }),
      ...(result.poster && { posterUrl: result.poster }),
    }))
  }

  override async resolveMatch(
    id: string,
    _query: MetadataSearchQuery,
  ): Promise<Metadata | undefined> {
    if (!this.#client || !id.startsWith('tt')) return
    return this.#client.fetchByImdbId(id)
  }

  override async enrich(
    filePath: string,
    libraryType: LibraryType,
    options?: EnrichOptions,
  ): Promise<Metadata | undefined> {
    if (!this.#client) return

    this.#ctx?.logger.info(`OMDb: enriching ${filePath}`)

    const existing = options?.metadata
    const imdbId = existing?.imdbId ?? existing?.imdbID

    try {
      // A previous metadata source (e.g. TMDb) may have already matched
      // this file to an IMDb id — an exact lookup beats a title search
      if (typeof imdbId === 'string' && imdbId.startsWith('tt')) {
        return await this.#client.fetchByImdbId(imdbId)
      }

      const title = options?.title
      if (!title) return

      const fileMetadata = options?.fileMetadata
      const year = Number(fileMetadata?.year) || undefined

      if (libraryType === LibraryType.TVShows) {
        const season = fileMetadata?.seasons?.[0]
        const episode = fileMetadata?.episodeNumbers?.[0]

        return season != null && episode != null
          ? await this.#client.fetchEpisodeMetadata(title, season, episode)
          : await this.#client.fetchSeriesMetadata(title, year)
      }

      return await this.#client.fetchMovieMetadata(title, year)
    } catch (err) {
      this.#ctx?.logger.error(
        `OMDb: enrichment failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
