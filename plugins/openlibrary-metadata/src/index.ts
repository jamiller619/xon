import type { PluginContext, PluginManifest } from '@xon/plugin-sdk'
import { BasePlugin } from '@xon/plugin-sdk'
import { MediaCategory } from '@xon/shared'
import { parseBookPath } from './bookParser.js'
import { OpenLibraryClient } from './openLibraryClient.js'

export class OpenLibraryMetadataPlugin extends BasePlugin {
  override readonly manifest: PluginManifest = {
    id: 'openlibrary-metadata',
    name: 'OpenLibrary Metadata',
    version: '1.0.0',
    description: 'Fetches book and document metadata from OpenLibrary',
    author: 'Xon',
    category: 'MetadataSource',
    // mediaCategories: [MediaCategory.Documents],
    main: 'dist/index.js',
    permissions: {
      network: ['openlibrary.org', 'covers.openlibrary.org'],
    },
  }

  private client: OpenLibraryClient | null = null
  private ctx: PluginContext | null = null

  override async init(context: PluginContext): Promise<void> {
    this.ctx = context
    this.client = new OpenLibraryClient(context.fetch)

    // Create plugin-scoped table
    await context.db.query(`
      CREATE TABLE IF NOT EXISTS plugin_openlibrary_metadata_books (
        media_id TEXT PRIMARY KEY,
        title TEXT,
        authors TEXT,
        author_bio TEXT,
        cover_url TEXT,
        subjects TEXT,
        publish_year INTEGER,
        page_count INTEGER,
        isbn TEXT,
        fetched_at INTEGER NOT NULL
      )
    `)

    context.on('media:created', async ({ mediaId, filePath }) => {
      await this.enrichMedia(mediaId, filePath)
    })

    context.on('media:updated', async ({ mediaId, filePath }) => {
      await this.enrichMedia(mediaId, filePath)
    })

    // Route: GET /api/plugins/openlibrary-metadata/metadata/:mediaId
    context.registerRoute({
      method: 'GET',
      path: '/metadata/:mediaId',
      handler: async (c) => {
        const mediaId = c.req.param('mediaId')
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

    const parsed = parseBookPath(filePath)
    const now = Date.now()

    try {
      let meta = null

      // Prefer ISBN lookup when available
      if (parsed.isbn) {
        meta = await this.client.searchByIsbn(parsed.isbn)
      }

      // Fall back to title/author search
      if (!meta) {
        meta = await this.client.searchByTitleAuthor(
          parsed.title,
          parsed.author,
        )
      }

      if (!meta) {
        this.ctx.logger.warn(
          `OpenLibrary: no match for "${parsed.title}"${parsed.author ? ` by ${parsed.author}` : ''}`,
        )
        return
      }

      await this.ctx.db.query(
        `INSERT OR REPLACE INTO plugin_openlibrary_metadata_books
          (media_id, title, authors, author_bio, cover_url, subjects,
           publish_year, page_count, isbn, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mediaId,
          meta.title,
          JSON.stringify(meta.authors),
          meta.authorBio ?? null,
          meta.coverUrl ?? null,
          JSON.stringify(meta.subjects),
          meta.publishYear ?? null,
          meta.pageCount ?? null,
          meta.isbn ?? null,
          now,
        ],
      )

      this.ctx.logger.info(
        `OpenLibrary: enriched "${meta.title}" for ${mediaId}`,
      )
    } catch (err) {
      this.ctx.logger.error(
        `OpenLibrary: enrichment failed for ${mediaId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async getStoredMetadata(mediaId: string): Promise<unknown> {
    if (!this.ctx) return null

    const rows = await this.ctx.db.query(
      'SELECT * FROM plugin_openlibrary_metadata_books WHERE media_id = ?',
      [mediaId],
    )
    if (rows.length === 0) return null

    const row = rows[0] as Record<string, unknown>
    return {
      ...row,
      authors: JSON.parse((row.authors as string | null) ?? '[]'),
      subjects: JSON.parse((row.subjects as string | null) ?? '[]'),
    }
  }

  override async deactivate(): Promise<void> {
    this.client = null
    this.ctx = null
  }
}

export default OpenLibraryMetadataPlugin
