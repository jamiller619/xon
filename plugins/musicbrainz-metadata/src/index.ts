import type { PluginContext, PluginManifest } from '@xon/plugin-sdk'
import { BasePlugin } from '@xon/plugin-sdk'
import { MediaCategory } from '@xon/shared'
import { MusicBrainzClient } from './musicBrainzClient.js'
import { parseMusicPath } from './musicParser.js'

export class MusicBrainzMetadataPlugin extends BasePlugin {
  override readonly manifest: PluginManifest = {
    id: 'musicbrainz-metadata',
    name: 'MusicBrainz Metadata',
    version: '1.0.0',
    description:
      'Fetches music metadata from MusicBrainz and cover art from the Cover Art Archive',
    author: 'Xon',
    category: 'MetadataSource',
    mediaCategories: [MediaCategory.Music],
    main: 'dist/index.js',
    permissions: {
      network: ['musicbrainz.org', 'coverartarchive.org'],
    },
  }

  private client: MusicBrainzClient | null = null
  private ctx: PluginContext | null = null

  override async init(context: PluginContext): Promise<void> {
    this.ctx = context
    this.client = new MusicBrainzClient(context.fetch)

    await context.db.query(`
      CREATE TABLE IF NOT EXISTS plugin_musicbrainz_metadata_tracks (
        media_id TEXT PRIMARY KEY,
        recording_mbid TEXT,
        release_mbid TEXT,
        title TEXT,
        artists TEXT,
        album TEXT,
        release_year TEXT,
        genres TEXT,
        label TEXT,
        catalog_number TEXT,
        cover_art_url TEXT,
        is_compilation INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        fetched_at INTEGER NOT NULL
      )
    `)

    context.on(
      'media:created',
      async ({ mediaId, filePath, mediaCategory }) => {
        if (!this.manifest.mediaCategories?.includes(mediaCategory)) return
        await this.enrichMedia(mediaId, filePath)
      },
    )

    context.on(
      'media:updated',
      async ({ mediaId, filePath, mediaCategory }) => {
        if (!this.manifest.mediaCategories?.includes(mediaCategory)) return
        await this.enrichMedia(mediaId, filePath)
      },
    )

    // Route: GET /api/plugins/musicbrainz-metadata/metadata/:mediaId
    context.registerRoute({
      method: 'GET',
      path: '/metadata/:mediaId',
      handler: async (c) => {
        const mediaId = c.req.param('mediaId') as string
        const metadata = await this.getStoredMetadata(mediaId)
        if (!metadata) {
          return c.json({ error: 'No metadata found' }, 404)
        }
        return c.json(metadata)
      },
    })
  }

  private async enrichMedia(mediaId: string, filePath: string): Promise<void> {
    if (!this.client || !this.ctx) return

    const parsed = parseMusicPath(filePath)
    const now = Date.now()

    try {
      const metadata = await this.client.searchRecording(
        parsed.title,
        parsed.artist,
        parsed.album,
      )

      if (!metadata) {
        this.ctx.logger.warn(
          `MusicBrainz: no match for "${parsed.title}"${parsed.artist ? ` by "${parsed.artist}"` : ''}`,
        )
        return
      }

      // Enrich with release details (label, catalog number, genres, cover art)
      if (metadata.releaseMbid) {
        const releaseDetails = await this.client.fetchReleaseDetails(
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

      await this.ctx.db.query(
        `INSERT OR REPLACE INTO plugin_musicbrainz_metadata_tracks
          (media_id, recording_mbid, release_mbid, title, artists, album, release_year,
           genres, label, catalog_number, cover_art_url, is_compilation, duration_ms, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mediaId,
          metadata.recordingMbid,
          metadata.releaseMbid,
          metadata.title,
          JSON.stringify(metadata.artists),
          metadata.album,
          metadata.releaseYear,
          JSON.stringify(metadata.genres),
          metadata.label,
          metadata.catalogNumber,
          metadata.coverArtUrl,
          metadata.isCompilation ? 1 : 0,
          metadata.durationMs,
          now,
        ],
      )

      const artistNames = metadata.artists.map((a) => a.name).join(', ')
      this.ctx.logger.info(
        `MusicBrainz: enriched "${metadata.title}" by ${artistNames} for ${mediaId}`,
      )
    } catch (err) {
      this.ctx.logger.error(
        `MusicBrainz: enrichment failed for ${mediaId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async getStoredMetadata(mediaId: string): Promise<unknown> {
    if (!this.ctx) return null

    const rows = await this.ctx.db.query(
      'SELECT * FROM plugin_musicbrainz_metadata_tracks WHERE media_id = ?',
      [mediaId],
    )
    if (rows.length === 0) return null

    const row = rows[0] as Record<string, unknown>
    return {
      ...row,
      artists: JSON.parse((row.artists as string | null) ?? '[]'),
      genres: JSON.parse((row.genres as string | null) ?? '[]'),
      isCompilation: row.is_compilation === 1,
    }
  }

  override async deactivate(): Promise<void> {
    this.client?.clearCache()
    this.client = null
    this.ctx = null
  }
}

export default MusicBrainzMetadataPlugin
