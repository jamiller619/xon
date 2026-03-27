import { access } from "node:fs/promises";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { dataSources, libraries } from "../schema.js";

const createSourceSchema = z.object({
  type: z.enum(["local", "network"]),
  path: z.string().min(1),
  recursive: z.boolean().optional().default(true),
  enabled: z.boolean().optional().default(true),
});

const updateSourceSchema = z.object({
  type: z.enum(["local", "network"]).optional(),
  path: z.string().min(1).optional(),
  recursive: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export function makeSourcesRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /:libraryId/sources — add data source
  router.post("/", zValidator("json", createSourceSchema), async (c) => {
    // libraryId comes from parent route /:libraryId/sources
    const libraryId = c.req.param("libraryId") as string;
    const body = c.req.valid("json");

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Library not found" }, 404);

    if (body.type === "local") {
      try {
        await access(body.path);
      } catch {
        return c.json({ error: "Path does not exist or is not accessible" }, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(dataSources).values({
      id,
      libraryId,
      type: body.type,
      path: body.path,
      recursive: body.recursive,
      enabled: body.enabled,
      createdAt: now,
      updatedAt: now,
    });
    const rows = await db.select().from(dataSources).where(eq(dataSources.id, id));
    return c.json(rows[0], 201);
  });

  // GET /:libraryId/sources — list data sources for library
  router.get("/", async (c) => {
    const libraryId = c.req.param("libraryId") as string;

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Library not found" }, 404);

    const rows = await db.select().from(dataSources).where(eq(dataSources.libraryId, libraryId));
    return c.json(rows);
  });

  // PUT /:libraryId/sources/:id — update data source
  router.put("/:id", zValidator("json", updateSourceSchema), async (c) => {
    const libraryId = c.req.param("libraryId") as string;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await db
      .select()
      .from(dataSources)
      .where(and(eq(dataSources.id, id), eq(dataSources.libraryId, libraryId)));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    const newType = body.type ?? existing[0]?.type ?? "local";
    const newPath = body.path ?? existing[0]?.path ?? "";

    if (newType === "local" && body.path !== undefined) {
      try {
        await access(newPath);
      } catch {
        return c.json({ error: "Path does not exist or is not accessible" }, 400);
      }
    }

    const updates: Partial<typeof dataSources.$inferInsert> = { updatedAt: new Date() };
    if (body.type !== undefined) updates.type = body.type;
    if (body.path !== undefined) updates.path = body.path;
    if (body.recursive !== undefined) updates.recursive = body.recursive;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db
      .update(dataSources)
      .set(updates)
      .where(and(eq(dataSources.id, id), eq(dataSources.libraryId, libraryId)));
    const updated = await db.select().from(dataSources).where(eq(dataSources.id, id));
    return c.json(updated[0]);
  });

  // DELETE /:libraryId/sources/:id — remove data source
  router.delete("/:id", async (c) => {
    const libraryId = c.req.param("libraryId") as string;
    const id = c.req.param("id");

    const existing = await db
      .select()
      .from(dataSources)
      .where(and(eq(dataSources.id, id), eq(dataSources.libraryId, libraryId)));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    await db
      .delete(dataSources)
      .where(and(eq(dataSources.id, id), eq(dataSources.libraryId, libraryId)));
    return c.json({ success: true });
  });

  return router;
}
