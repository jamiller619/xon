import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import type { MediaItem } from "../schema.js";
import { mediaItems } from "../schema.js";
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

  return router;
}
