import {
  type EnrichOptions,
  type MetadataSearchQuery,
  type MetadataSearchResult,
  MetadataSourcePlugin,
  type PluginContext,
} from '@xon/plugin-sdk'
import {
  LibraryType,
  MediaType,
  type Metadata,
  type PosterImage,
} from '@xon/shared'
import {
  type ImageResult,
  type MovieSearchResult,
  type PersonImageResult,
  TmdbClient,
} from './tmdbClient.js'

export type { ImageResult, PersonImageResult }

type ArtworkEntry = string | { src: string; [key: string]: unknown }

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

  override getSearchAvailability() {
    return this.#client
      ? { available: true }
      : { available: false, reason: 'TMDb API key is not configured' }
  }

  override async search(
    query: MetadataSearchQuery,
  ): Promise<MetadataSearchResult[]> {
    if (!this.#client) return []

    if (query.libraryType === LibraryType.TVShows) {
      const results = await this.#client.searchTv(query.title)
      return (results ?? []).slice(0, query.limit).map((result) => ({
        id: String(result.tmdbId),
        title: result.title,
        mediaKind: 'series',
        ...(result.firstAirDate && {
          releaseDate: result.firstAirDate,
          year: Number(result.firstAirDate.slice(0, 4)) || undefined,
        }),
        ...(result.poster && { posterUrl: result.poster }),
        ...(result.overview && { description: result.overview }),
      }))
    }

    const results = await this.#client.searchMovies(
      query.title,
      query.year == null ? undefined : String(query.year),
    )
    return (results ?? []).slice(0, query.limit).map((result) => ({
      id: String(result.tmdbId),
      title: result.title,
      mediaKind: 'movie',
      ...(result.releaseDate && {
        releaseDate: result.releaseDate,
        year: Number(result.releaseDate.slice(0, 4)) || undefined,
      }),
      ...(result.poster && { posterUrl: result.poster }),
    }))
  }

  override async resolveMatch(
    id: string,
    query: MetadataSearchQuery,
  ): Promise<Metadata | undefined> {
    if (!this.#client) return
    const numericId = Number(id)
    if (!Number.isInteger(numericId) || numericId <= 0) return

    const metadata =
      query.libraryType === LibraryType.TVShows
        ? await this.#client.fetchTvMetadataById(
            numericId,
            query.fileMetadata?.seasons?.[0],
            query.fileMetadata?.episodeNumbers?.[0],
          )
        : await this.#client.fetchMovieMetadataById(
            numericId,
            this.#ctx?.settings.get<string>('language') || 'en',
          )

    if (metadata && this.#ctx?.settings.get<boolean>('saveImages')) {
      await this.#saveImagesLocally(metadata)
    }
    return metadata
  }

  override async findPosters(
    id: string,
    query: MetadataSearchQuery,
  ): Promise<Array<string | PosterImage>> {
    if (!this.#client) return []
    const numericId = Number(id)
    if (!Number.isInteger(numericId) || numericId <= 0) return []

    const posters = await this.#client.fetchPostersById(
      query.libraryType === LibraryType.TVShows ? 'tv' : 'movie',
      numericId,
      this.#ctx?.settings.get<string>('language') || 'en',
    )
    const metadata: Metadata = { images: { poster: posters } }

    if (this.#ctx?.settings.get<boolean>('saveImages')) {
      await this.#saveImagesLocally(metadata)
    }

    return metadata.images.poster as PosterImage[]
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
      const imdbId = options?.metadata?.imdbId ?? options?.metadata?.imdbID
      const exact =
        typeof imdbId === 'string' && imdbId.startsWith('tt')
          ? await this.#client?.findByImdbId(imdbId)
          : undefined
      const metadata = exact
        ? exact.type === 'series'
          ? await this.#client?.fetchTvMetadataById(
              exact.id,
              fileMetadata?.seasons?.[0],
              fileMetadata?.episodeNumbers?.[0],
            )
          : await this.#client?.fetchMovieMetadataById(
              exact.id,
              options?.lang ||
                this.#ctx?.settings.get<string>('language') ||
                'en',
            )
        : libraryType === LibraryType.TVShows
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
      | Record<string, ArtworkEntry | ArtworkEntry[]>
      | undefined

    if (!ctx || !images) return

    const limit = ctx.settings.get<number>('imageLimit') || 0

    for (const [kind, value] of Object.entries(images)) {
      if (Array.isArray(value)) {
        const count =
          kind === 'poster' && limit > 0
            ? Math.min(limit, value.length)
            : value.length
        for (let i = 0; i < count; i++) {
          const image = value[i]
          if (typeof image === 'string') {
            value[i] = await this.#saveImage(image)
          } else if (image) {
            image.src = await this.#saveImage(image.src)
          }
        }
      } else if (typeof value === 'string') {
        images[kind] = await this.#saveImage(value)
      } else if (value) {
        value.src = await this.#saveImage(value.src)
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
