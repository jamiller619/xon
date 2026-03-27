import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { mediaItems } from "../schema.js";
import type { ThumbnailPaths } from "../thumbnails.js";

const VALID_SIZES = ["small", "medium", "large"] as const;
type ThumbnailSize = (typeof VALID_SIZES)[number];

export function makeMediaRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

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
