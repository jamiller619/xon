import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../rbac.js";
import { dataSources, libraries, mediaItems } from "../schema.js";
import { withThumbnailUrls } from "./media.js";
import { makeScanRouter } from "./scan.js";
import { makeSourcesRouter } from "./sources.js";

const createLibrarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  allowedMediaTypes: z.array(z.string()).optional().default([]),
});

const updateLibrarySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  allowedMediaTypes: z.array(z.string()).optional(),
});

export function makeLibrariesRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /libraries — create library (manager+)
  router.post("/", requireRole("manager"), zValidator("json", createLibrarySchema), async (c) => {
    const body = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(libraries).values({
      id,
      name: body.name,
      description: body.description,
      allowedMediaTypes: JSON.stringify(body.allowedMediaTypes),
      createdAt: now,
      updatedAt: now,
    });
    const rows = await db.select().from(libraries).where(eq(libraries.id, id));
    return c.json(rows[0], 201);
  });

  // GET /libraries — list all libraries
  router.get("/", async (c) => {
    const rows = await db.select().from(libraries);
    return c.json(rows);
  });

  // GET /libraries/:id — get single library with data sources
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(libraries).where(eq(libraries.id, id));
    if (rows.length === 0) return c.json({ error: "Not found" }, 404);
    const sources = await db.select().from(dataSources).where(eq(dataSources.libraryId, id));
    return c.json({ ...rows[0], dataSources: sources });
  });

  // PUT /libraries/:id — update library (manager+)
  router.put("/:id", requireRole("manager"), zValidator("json", updateLibrarySchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const existing = await db.select().from(libraries).where(eq(libraries.id, id));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    const updates: Partial<typeof libraries.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.allowedMediaTypes !== undefined) {
      updates.allowedMediaTypes = JSON.stringify(body.allowedMediaTypes);
    }

    await db.update(libraries).set(updates).where(eq(libraries.id, id));
    const updated = await db.select().from(libraries).where(eq(libraries.id, id));
    return c.json(updated[0]);
  });

  // DELETE /libraries/:id — delete library and associated data sources (manager+)
  router.delete("/:id", requireRole("manager"), async (c) => {
    const id = c.req.param("id");
    const existing = await db.select().from(libraries).where(eq(libraries.id, id));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);
    await db.delete(libraries).where(eq(libraries.id, id));
    return c.json({ success: true });
  });

  // GET /libraries/:libraryId/media — list media items with filtering, sorting, pagination
  router.get("/:libraryId/media", async (c) => {
    const libraryId = c.req.param("libraryId") as string;
    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Not found" }, 404);

    const { mediaCategory, mimeType, drmProtected, sortBy, order, page, limit } = c.req.query();

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(mediaItems.libraryId, libraryId)];
    if (mediaCategory) conditions.push(eq(mediaItems.mediaCategory, mediaCategory));
    if (mimeType) conditions.push(eq(mediaItems.mimeType, mimeType));
    if (drmProtected !== undefined && drmProtected !== "") {
      conditions.push(eq(mediaItems.drmProtected, drmProtected === "true"));
    }

    const sortDir = order === "desc" ? desc : asc;
    const orderExpr =
      sortBy === "title"
        ? sortDir(mediaItems.title)
        : sortBy === "fileSize"
          ? sortDir(mediaItems.fileSize)
          : sortBy === "releaseDate"
            ? sortDir(sql`json_extract(${mediaItems.metadata}, '$.releaseDate')`)
            : sortBy === "rating"
              ? sortDir(sql`json_extract(${mediaItems.metadata}, '$.rating')`)
              : sortDir(mediaItems.createdAt);

    const rows = await db
      .select()
      .from(mediaItems)
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(limitNum)
      .offset(offset);

    return c.json(rows.map(withThumbnailUrls));
  });

  router.route("/:libraryId/sources", makeSourcesRouter(db));
  router.route("/:libraryId/scan", makeScanRouter(db));

  return router;
}
