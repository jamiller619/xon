import path from 'node:path'
import { MetadataSourcePlugin, type PluginContext } from '@xon/plugin-sdk'
import { MediaType, type Metadata } from '@xon/shared'
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

  async enrich(filePath: string): Promise<Metadata | undefined> {
    if (!this.#client || !this.#ctx) return

    const parsed = parseMusicPath(filePath)

    try {
      const metadata = await this.#client.searchRecording(
        parsed.title,
        parsed.artist,
        parsed.album,
      )

      if (!metadata) {
        this.#ctx.logger.warn(
          `MusicBrainz: no match for "${parsed.title}"${parsed.artist ? ` by "${parsed.artist}"` : ''}`,
        )
        return
      }

      // Enrich with release details (label, catalog number, genres, cover art)
      if (metadata.releaseMbid) {
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

export default MusicBrainzMetadataPlugin
