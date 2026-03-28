import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { extractStreamTracks } from "../ffprobe.js";
import { convertMobiToEpub } from "../mobi.js";
import type { MediaItem } from "../schema.js";
import { mediaItems, readingPositions } from "../schema.js";
import type { ThumbnailPaths } from "../thumbnails.js";

const VALID_SIZES = ["small", "medium", "large"] as const;
type ThumbnailSize = (typeof VALID_SIZES)[number];

export function withThumbnailUrls(item: MediaItem) {
  const thumbnailUrls = item.thumbnailPaths
    ? {
        small: `/api/v1/media/${item.id}/thumbnail?size=small`,
        medium: `/api/v1/media/${item.id}/thumbnail?size=medium`,
        large: `/api/v1/media/${item.id}/thumbnail?size=large`,
      }
    : null;
  return { ...item, thumbnailUrls };
}

export function makeMediaRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // GET /media — list all media items with optional sort and limit
  router.get("/", async (c) => {
    const { sortBy, order, page, limit } = c.req.query();
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100);
    const offset = (pageNum - 1) * limitNum;

    const sortDir = order === "asc" ? asc : desc;
    const orderExpr =
      sortBy === "title"
        ? sortDir(mediaItems.title)
        : sortBy === "fileSize"
          ? sortDir(mediaItems.fileSize)
          : sortDir(mediaItems.createdAt);

    const rows = await db
      .select()
      .from(mediaItems)
      .orderBy(orderExpr)
      .limit(limitNum)
      .offset(offset);

    return c.json(rows.map(withThumbnailUrls));
  });

  // GET /media/:id — get single media item with full metadata and thumbnail URLs
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json(withThumbnailUrls(item));
  });

  const updateMediaSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  // PUT /media/:id — update editable metadata fields
  router.put("/:id", zValidator("json", updateMediaSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);

    const updates: Partial<typeof mediaItems.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.tags !== undefined) {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(item.metadata) as Record<string, unknown>;
      } catch {
        // ignore
      }
      meta.tags = body.tags;
      updates.metadata = JSON.stringify(meta);
    }

    await db.update(mediaItems).set(updates).where(eq(mediaItems.id, id));
    const updated = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    return c.json(withThumbnailUrls(updated[0] as MediaItem));
  });

  // GET /media/:id/stream — serve media file with HTTP range request support
  router.get("/:id/stream", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);

    let fileSize: number;
    try {
      const stats = await stat(item.filePath);
      fileSize = stats.size;
    } catch {
      return c.json({ error: "File not accessible" }, 404);
    }

    const range = c.req.header("Range");
    const mimeType = item.mimeType ?? "application/octet-stream";

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return c.json({ error: "Invalid range" }, 400);
      const start = Number.parseInt(match[1] ?? "0", 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

      if (start > end || end >= fileSize) {
        return c.body(null, 416, { "Content-Range": `bytes */${fileSize}` });
      }

      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(item.filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return c.body(webStream, 206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": mimeType,
      });
    }

    const nodeStream = createReadStream(item.filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return c.body(webStream, 200, {
      "Accept-Ranges": "bytes",
      "Content-Length": String(fileSize),
      "Content-Type": mimeType,
    });
  });

  // GET /media/:id/tracks — list audio and subtitle tracks (embedded + external)
  router.get("/:id/tracks", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);

    const allTracks = await extractStreamTracks(item.filePath);
    const audioTracks = allTracks
      .filter((t) => t.codecType === "audio")
      .map((t) => ({ index: t.index, codec: t.codec, language: t.language, title: t.title }));
    const embeddedSubs = allTracks
      .filter((t) => t.codecType === "subtitle")
      .map((t) => ({
        type: "embedded" as const,
        index: t.index,
        codec: t.codec,
        language: t.language,
        title: t.title,
        label: t.title ?? t.language ?? `Track ${t.index}`,
      }));

    const dir = dirname(item.filePath);
    const base = basename(item.filePath, extname(item.filePath));
    let externalSubs: {
      type: "external";
      file: string;
      language?: string;
      label: string;
    }[] = [];

    try {
      const entries = await readdir(dir);
      externalSubs = entries
        .filter((f) => {
          const ext = extname(f).toLowerCase();
          return (ext === ".srt" || ext === ".vtt") && f.startsWith(base);
        })
        .map((f) => {
          // Try to extract language code from filename like "movie.en.srt" or "movie.en.US.srt"
          const withoutExt = basename(f, extname(f));
          const suffix = withoutExt.slice(base.length).replace(/^\./, "");
          const language = suffix || undefined;
          return {
            type: "external" as const,
            file: f,
            ...(language ? { language } : {}),
            label: language
              ? `${language.toUpperCase()} (external)`
              : `External (${extname(f).slice(1).toUpperCase()})`,
          };
        });
    } catch {
      // directory not readable — return empty external list
    }

    return c.json({
      audioTracks,
      subtitleTracks: [...embeddedSubs, ...externalSubs],
    });
  });

  // GET /media/:id/subtitle?file=filename.srt — serve an external subtitle file
  router.get("/:id/subtitle", async (c) => {
    const id = c.req.param("id");
    const file = c.req.query("file");

    if (!file) return c.json({ error: "Missing file parameter" }, 400);
    // Security: reject path traversal and ensure valid extension
    if (file.includes("/") || file.includes("\\") || file.includes("..")) {
      return c.json({ error: "Invalid file parameter" }, 400);
    }
    const ext = extname(file).toLowerCase();
    if (ext !== ".srt" && ext !== ".vtt") {
      return c.json({ error: "Only .srt and .vtt subtitle files are supported" }, 400);
    }

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);

    const subtitlePath = join(dirname(item.filePath), file);
    let content: Buffer;
    try {
      content = await readFile(subtitlePath);
    } catch {
      return c.json({ error: "Subtitle file not found" }, 404);
    }

    // Serve as WebVTT; add WEBVTT header for .srt files for browser compatibility
    let body = content.toString("utf-8");
    if (ext === ".srt" && !body.startsWith("WEBVTT")) {
      body = `WEBVTT\n\n${body}`;
    }

    return c.text(body, 200, {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  // GET /media/:id/thumbnail?size=small|medium|large
  router.get("/:id/thumbnail", async (c) => {
    const id = c.req.param("id");
    const sizeParam = c.req.query("size") ?? "medium";

    if (!VALID_SIZES.includes(sizeParam as ThumbnailSize)) {
      return c.json({ error: "Invalid size. Must be small, medium, or large." }, 400);
    }
    const size = sizeParam as ThumbnailSize;

    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);
    if (!item.thumbnailPaths) return c.json({ error: "No thumbnail available" }, 404);

    let paths: ThumbnailPaths;
    try {
      paths = JSON.parse(item.thumbnailPaths) as ThumbnailPaths;
    } catch {
      return c.json({ error: "No thumbnail available" }, 404);
    }

    const filePath = paths[size];
    if (!filePath) return c.json({ error: "No thumbnail available" }, 404);

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return c.json({ error: "No thumbnail available" }, 404);
    }

    return c.body(new Uint8Array(buffer), 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    });
  });

  // GET /media/:id/epub — serve EPUB file (or convert MOBI to EPUB)
  router.get("/:id/epub", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    const item = rows[0];
    if (!item) return c.json({ error: "Not found" }, 404);

    const ext = extname(item.filePath).toLowerCase();
    if (ext !== ".epub" && ext !== ".mobi" && ext !== ".azw" && ext !== ".azw3") {
      return c.json({ error: "Not an EPUB or MOBI file" }, 400);
    }

    let epubPath = item.filePath;

    if (ext !== ".epub") {
      // Convert MOBI/AZW to EPUB via ebook-convert (calibre)
      let converted: string;
      try {
        converted = await convertMobiToEpub(item.filePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Conversion failed";
        return c.json({ error: msg }, 500);
      }
      epubPath = converted;
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(epubPath);
    } catch {
      return c.json({ error: "File not accessible" }, 404);
    }

    return c.body(new Uint8Array(buffer), 200, {
      "Content-Type": "application/epub+zip",
      "Cache-Control": "no-store",
    });
  });

  // GET /media/:id/reading-position — retrieve saved reading position
  router.get("/:id/reading-position", async (c) => {
    const id = c.req.param("id");
    const rows = await db
      .select()
      .from(readingPositions)
      .where(eq(readingPositions.mediaItemId, id));
    const pos = rows[0];
    if (!pos) return c.json(null);
    return c.json({ cfi: pos.cfi, chapterTitle: pos.chapterTitle });
  });

  const readingPositionSchema = z.object({
    cfi: z.string().min(1),
    chapterTitle: z.string().optional(),
  });

  // PUT /media/:id/reading-position — upsert reading position
  router.put("/:id/reading-position", zValidator("json", readingPositionSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // Verify media item exists
    const itemRows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    if (!itemRows[0]) return c.json({ error: "Not found" }, 404);

    const existing = await db
      .select()
      .from(readingPositions)
      .where(eq(readingPositions.mediaItemId, id));

    if (existing[0]) {
      await db
        .update(readingPositions)
        .set({
          cfi: body.cfi,
          ...(body.chapterTitle !== undefined ? { chapterTitle: body.chapterTitle } : {}),
          updatedAt: new Date(),
        })
        .where(eq(readingPositions.mediaItemId, id));
    } else {
      const crypto = await import("node:crypto");
      await db.insert(readingPositions).values({
        id: crypto.randomUUID(),
        mediaItemId: id,
        cfi: body.cfi,
        ...(body.chapterTitle !== undefined ? { chapterTitle: body.chapterTitle } : {}),
      });
    }

    return c.json({ ok: true });
  });

  return router;
}
