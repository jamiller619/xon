import {
  type EnrichOptions,
  MetadataSourcePlugin,
  type PluginContext,
} from '@xon/plugin-sdk'
import { LibraryType, MediaType, type Metadata } from '@xon/shared'
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

    const apiKey =
      context.settings.get<string>('apiKey') || process.env.TMDB_API_KEY

    if (!apiKey) {
      context.logger.warn(
        'No API key configured (settings or TMDB_API_KEY) — TMDb metadata enrichment disabled',
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
    libraryType: LibraryType,
    options?: EnrichOptions,
  ): Promise<Metadata | undefined> {
    this.#ctx?.logger.info(`TMDb: enriching ${filePath}`)

    const title = options?.title
    if (!title) return

    const fileMetadata = options?.fileMetadata
    const year = Number(fileMetadata?.year) || undefined

    try {
      const metadata =
        libraryType === LibraryType.TVShows
          ? await this.#client?.fetchTvMetadata(
              title,
              fileMetadata?.seasons?.[0],
              fileMetadata?.episodeNumbers?.[0],
            )
          : await this.#client?.fetchMovieMetadata(
              title,
              year,
              options?.lang ||
                this.#ctx?.settings.get<string>('language') ||
                'en',
            )

      if (metadata && this.#ctx?.settings.get<boolean>('saveImages')) {
        await this.#saveImagesLocally(metadata)
      }

      return metadata
    } catch (err) {
      this.#ctx?.logger.error(
        `TMDb: enrichment failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Save the item's artwork through the host's image storage API and rewrite
   * `metadata.images` entries to the saved file paths. Entries beyond the
   * configured limit (or that fail to save) keep their TMDb URLs.
   */
  async #saveImagesLocally(metadata: Metadata): Promise<void> {
    const ctx = this.#ctx
    const images = metadata.images as
      | Record<string, string | string[]>
      | undefined

    if (!ctx || !images) return

    const limit = ctx.settings.get<number>('imageLimit') || 0

    for (const [kind, value] of Object.entries(images)) {
      if (Array.isArray(value)) {
        const count = limit > 0 ? Math.min(limit, value.length) : value.length
        for (let i = 0; i < count; i++) {
          value[i] = await this.#saveImage(value[i] ?? '')
        }
      } else if (typeof value === 'string') {
        images[kind] = await this.#saveImage(value)
      }
    }
  }

  /**
   * Save a single image via the host, returning the local file path or the
   * original URL when saving fails.
   */
  async #saveImage(url: string): Promise<string> {
    const ctx = this.#ctx
    if (!ctx || !url.startsWith('http')) return url

    try {
      return await ctx.images.save(url)
    } catch (err) {
      ctx.logger.warn(
        `Image save failed: ${url}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return url
    }
  }
}
