import path from 'node:path'
import {
  type EnrichOptions,
  MetadataSourcePlugin,
  type PluginContext,
} from '@xon/plugin-sdk'
import { type ContentType, MediaType, type Metadata } from '@xon/shared'
import { MusicBrainzClient } from './musicBrainzClient.js'
import { parseMusicPath } from './musicParser.js'

export class MusicBrainzMetadataPlugin extends MetadataSourcePlugin {
  override mediaTypes = [MediaType.MainType.Audio]

  #client: MusicBrainzClient | null = null
  #ctx: PluginContext | null = null

  override async init(context: PluginContext): Promise<void> {
    this.#ctx = context
    this.#client = new MusicBrainzClient(context.fetch)
  }

  async enrich(
    filePath: string,
    _contentType: ContentType,
    options?: EnrichOptions,
  ): Promise<Metadata | undefined> {
    if (!this.#client || !this.#ctx) return
    if (/\.(?:m3u8?|pls)$/i.test(filePath)) return

    const parsed = parseMusicPath(filePath)
    const title =
      nonEmptyString(options?.fileMetadata?.title) ??
      nonEmptyString(options?.title) ??
      parsed.title
    const artist =
      nonEmptyString(options?.fileMetadata?.artist) ?? parsed.artist
    const album = nonEmptyString(options?.fileMetadata?.album) ?? parsed.album
    const albumArtist =
      nonEmptyString(options?.fileMetadata?.albumArtist) ?? artist
    const year = positiveNumber(options?.fileMetadata?.year)
    const trackNumber = positiveNumber(options?.fileMetadata?.trackNumber)
    const discNumber = positiveNumber(options?.fileMetadata?.discNumber)
    const durationSeconds = positiveNumber(options?.fileMetadata?.duration)

    try {
      const albumMetadata =
        album && albumArtist
          ? await this.#client.searchAlbumTrack({
              album,
              albumArtist,
              title,
              ...(year ? { year } : {}),
              ...(trackNumber ? { trackNumber } : {}),
              ...(discNumber ? { discNumber } : {}),
              ...(durationSeconds
                ? { durationMs: durationSeconds * 1000 }
                : {}),
            })
          : null
      const metadata =
        albumMetadata ??
        (await this.#client.searchRecording(title, artist, album))

      if (!metadata) {
        this.#ctx.logger.warn(
          `MusicBrainz: no match for "${title}"${artist ? ` by "${artist}"` : ''}`,
        )
        return
      }

      // Enrich with release details (label, catalog number, genres, cover art)
      if (!albumMetadata && metadata.releaseMbid) {
        const releaseDetails = await this.#client.fetchReleaseDetails(
          metadata.releaseMbid,
        )
        if (releaseDetails) {
          if (releaseDetails.label !== undefined)
            metadata.label = releaseDetails.label
          if (releaseDetails.catalogNumber !== undefined)
            metadata.catalogNumber = releaseDetails.catalogNumber
          if (
            releaseDetails.genres !== undefined &&
            releaseDetails.genres.length > 0
          )
            metadata.genres = releaseDetails.genres
          if (releaseDetails.isCompilation !== undefined)
            metadata.isCompilation = releaseDetails.isCompilation
          if (releaseDetails.coverArtUrl !== undefined)
            metadata.coverArtUrl = releaseDetails.coverArtUrl
        }
      }

      if (metadata.coverArtUrl) {
        metadata.images = { poster: [metadata.coverArtUrl] }
      }

      return metadata
    } catch (err) {
      this.#ctx.logger.error(
        `MusicBrainz: enrichment failed for ${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  override async deactivate(): Promise<void> {
    this.#client?.clearCache()
    this.#client = null
    this.#ctx = null
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export default MusicBrainzMetadataPlugin
