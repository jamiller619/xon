import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { dataSources, libraries } from "../schema.js";

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

  // POST /libraries — create library
  router.post("/", zValidator("json", createLibrarySchema), async (c) => {
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

  // PUT /libraries/:id — update library
  router.put("/:id", zValidator("json", updateLibrarySchema), async (c) => {
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

  // DELETE /libraries/:id — delete library and associated data sources
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await db.select().from(libraries).where(eq(libraries.id, id));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);
    await db.delete(libraries).where(eq(libraries.id, id));
    return c.json({ success: true });
  });

  return router;
}
