import { MetadataSourcePlugin, type PluginContext } from '@xon/plugin-sdk'
import { type LibraryType, MediaType, type Metadata } from '@xon/shared'
import { parseMediaTitle } from './titleParser.js'
import {
  type ImageResult,
  type MovieSearchResult,
  type PersonImageResult,
  TmdbClient,
} from './tmdbClient.js'

export type { ImageResult, PersonImageResult }

export default class TmdbMetadataPlugin extends MetadataSourcePlugin {
  override mediaTypes = [MediaType.MainType.Video]

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

  async findMatch(
    title: string,
    year?: string,
  ): Promise<MovieSearchResult[] | undefined> {
    return this.#client?.searchMovies(title, year)
  }

  async fetchPersonImage(
    personId: number,
  ): Promise<PersonImageResult | undefined> {
    return this.#client?.fetchPersonImage(personId)
  }

  override async enrich(
    filePath: string,
    _: LibraryType,
    lang?: string,
  ): Promise<Metadata | undefined> {
    this.#ctx?.logger.info(`TMDb: enriching ${filePath}`)

    const parsed = parseMediaTitle(filePath)

    try {
      if (parsed.type === 'movie') {
        return await this.#client?.fetchMovieMetadata(
          parsed.title,
          parsed.year,
          lang,
        )
      }

      if (parsed.type === 'tv') {
        return await this.#client?.fetchTvMetadata(
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
