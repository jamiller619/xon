import { BasePlugin } from "@xon/plugin-sdk";
import type { PluginContext, PluginManifest } from "@xon/plugin-sdk";
import { MediaCategory } from "@xon/shared";
import { parseMediaTitle } from "./titleParser.js";
import { TmdbClient } from "./tmdbClient.js";

export class TmdbMetadataPlugin extends BasePlugin {
  override readonly manifest: PluginManifest = {
    id: "tmdb-metadata",
    name: "TMDb Metadata",
    version: "1.0.0",
    description: "Fetches movie and TV show metadata from The Movie Database (TMDb)",
    author: "Xon",
    category: "MetadataSource",
    mediaCategories: [MediaCategory.Movies, MediaCategory.TVShows],
    main: "dist/index.js",
    permissions: {
      network: ["api.themoviedb.org"],
    },
  };

  private client: TmdbClient | null = null;
  private ctx: PluginContext | null = null;

  override async init(context: PluginContext): Promise<void> {
    this.ctx = context;

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      context.logger.warn("TMDB_API_KEY not set — TMDb metadata enrichment disabled");
      return;
    }

    this.client = new TmdbClient(apiKey, context.fetch);

    // Create plugin-scoped tables
    await context.db.query(`
      CREATE TABLE IF NOT EXISTS plugin_tmdb_metadata_movies (
        media_id TEXT PRIMARY KEY,
        tmdb_id INTEGER,
        title TEXT,
        original_title TEXT,
        overview TEXT,
        poster_path TEXT,
        backdrop_path TEXT,
        release_date TEXT,
        vote_average REAL,
        genres TEXT,
        cast_data TEXT,
        crew_data TEXT,
        fetched_at INTEGER NOT NULL
      )
    `);

    await context.db.query(`
      CREATE TABLE IF NOT EXISTS plugin_tmdb_metadata_tv (
        media_id TEXT PRIMARY KEY,
        tmdb_id INTEGER,
        series_id INTEGER,
        title TEXT,
        original_title TEXT,
        overview TEXT,
        poster_path TEXT,
        backdrop_path TEXT,
        first_air_date TEXT,
        vote_average REAL,
        genres TEXT,
        cast_data TEXT,
        crew_data TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        episode_title TEXT,
        episode_overview TEXT,
        episode_still_path TEXT,
        fetched_at INTEGER NOT NULL
      )
    `);

    // Enrich on media create/update events
    context.on("media:created", async ({ mediaId, filePath }) => {
      await this.enrichMedia(mediaId, filePath);
    });

    context.on("media:updated", async ({ mediaId, filePath }) => {
      await this.enrichMedia(mediaId, filePath);
    });

    // Route: GET /api/v1/plugins/tmdb-metadata/metadata/:mediaId
    context.registerRoute({
      method: "GET",
      path: "/metadata/:mediaId",
      handler: async (c) => {
        const mediaId = c.req.param("mediaId");
        const metadata = await this.getStoredMetadata(mediaId);
        if (!metadata) {
          return c.json({ error: "No metadata found" }, 404);
        }
        return c.json(metadata);
      },
    });
  }

  private async enrichMedia(mediaId: string, filePath: string): Promise<void> {
    if (!this.client || !this.ctx) return;

    const parsed = parseMediaTitle(filePath);
    const now = Date.now();

    try {
      if (parsed.type === "movie") {
        const meta = await this.client.fetchMovieMetadata(parsed.title, parsed.year);
        if (!meta) {
          this.ctx.logger.warn(`TMDb: no movie match for "${parsed.title}"`);
          return;
        }
        await this.ctx.db.query(
          `INSERT OR REPLACE INTO plugin_tmdb_metadata_movies
            (media_id, tmdb_id, title, original_title, overview, poster_path, backdrop_path,
             release_date, vote_average, genres, cast_data, crew_data, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mediaId,
            meta.tmdbId,
            meta.title,
            meta.originalTitle,
            meta.overview,
            meta.posterPath,
            meta.backdropPath,
            meta.releaseDate,
            meta.voteAverage,
            JSON.stringify(meta.genres),
            JSON.stringify(meta.cast),
            JSON.stringify(meta.crew),
            now,
          ]
        );
        this.ctx.logger.info(`TMDb: enriched movie "${meta.title}" for ${mediaId}`);
      } else {
        const meta = await this.client.fetchTvMetadata(
          parsed.seriesTitle,
          parsed.season,
          parsed.episode
        );
        if (!meta) {
          this.ctx.logger.warn(`TMDb: no TV match for "${parsed.seriesTitle}"`);
          return;
        }
        await this.ctx.db.query(
          `INSERT OR REPLACE INTO plugin_tmdb_metadata_tv
            (media_id, tmdb_id, series_id, title, original_title, overview, poster_path,
             backdrop_path, first_air_date, vote_average, genres, cast_data, crew_data,
             season_number, episode_number, episode_title, episode_overview,
             episode_still_path, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mediaId,
            meta.tmdbId,
            meta.seriesId,
            meta.title,
            meta.originalTitle,
            meta.overview,
            meta.posterPath,
            meta.backdropPath,
            meta.firstAirDate,
            meta.voteAverage,
            JSON.stringify(meta.genres),
            JSON.stringify(meta.cast),
            JSON.stringify(meta.crew),
            meta.seasonNumber,
            meta.episodeNumber,
            meta.episodeTitle ?? null,
            meta.episodeOverview ?? null,
            meta.episodeStillPath ?? null,
            now,
          ]
        );
        this.ctx.logger.info(
          `TMDb: enriched TV "${meta.title}" S${meta.seasonNumber}E${meta.episodeNumber} for ${mediaId}`
        );
      }
    } catch (err) {
      this.ctx.logger.error(
        `TMDb: enrichment failed for ${mediaId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async getStoredMetadata(mediaId: string): Promise<unknown> {
    if (!this.ctx) return null;

    const movieRows = await this.ctx.db.query(
      "SELECT * FROM plugin_tmdb_metadata_movies WHERE media_id = ?",
      [mediaId]
    );
    if (movieRows.length > 0) {
      const row = movieRows[0] as Record<string, unknown>;
      return {
        type: "movie",
        ...row,
        genres: JSON.parse((row.genres as string | null) ?? "[]"),
        cast: JSON.parse((row.cast_data as string | null) ?? "[]"),
        crew: JSON.parse((row.crew_data as string | null) ?? "[]"),
      };
    }

    const tvRows = await this.ctx.db.query(
      "SELECT * FROM plugin_tmdb_metadata_tv WHERE media_id = ?",
      [mediaId]
    );
    if (tvRows.length > 0) {
      const row = tvRows[0] as Record<string, unknown>;
      return {
        type: "tv",
        ...row,
        genres: JSON.parse((row.genres as string | null) ?? "[]"),
        cast: JSON.parse((row.cast_data as string | null) ?? "[]"),
        crew: JSON.parse((row.crew_data as string | null) ?? "[]"),
      };
    }

    return null;
  }

  override async deactivate(): Promise<void> {
    this.client?.clearCache();
    this.client = null;
    this.ctx = null;
  }
}

export default TmdbMetadataPlugin;
