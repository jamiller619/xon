import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../rbac.js";
import {
  dataSources,
  getAllowedRatings,
  libraries,
  libraryAccess,
  mediaItems,
  users,
} from "../schema.js";
import { validate } from "../validate.js";
import { withThumbnailUrls } from "./media.js";
import { makeScanRouter } from "./scan.js";
import { makeSourcesRouter } from "./sources.js";

const PRIVILEGED_ROLES = ["admin", "manager"] as const;

/** Returns library IDs accessible to the requesting user. Admins/managers see all. */
async function getAccessibleLibraryIds(
  db: LibSQLDatabase,
  userId: string,
  role: string
): Promise<string[] | null> {
  if ((PRIVILEGED_ROLES as readonly string[]).includes(role)) return null; // null = all
  const rows = await db
    .select({ libraryId: libraryAccess.libraryId })
    .from(libraryAccess)
    .where(eq(libraryAccess.userId, userId));
  return rows.map((r) => r.libraryId);
}

/** Builds a Drizzle WHERE condition restricting media items by the user's maxContentRating. */
async function getContentRatingCondition(db: LibSQLDatabase, userId: string) {
  const userRows = await db
    .select({ maxContentRating: users.maxContentRating })
    .from(users)
    .where(eq(users.id, userId));
  const maxRating = userRows[0]?.maxContentRating ?? "none";
  const allowed = getAllowedRatings(maxRating);
  if (allowed === null) return null; // no restriction
  if (allowed.length === 0) return isNull(mediaItems.contentRating);
  const unratedAllowed = (allowed as string[]).includes("unrated");
  if (unratedAllowed) {
    return or(
      isNull(mediaItems.contentRating),
      inArray(mediaItems.contentRating, allowed)
    ) as SQL<unknown>;
  }
  return inArray(mediaItems.contentRating, allowed);
}

const libraryMediaQuerySchema = z.object({
  mediaCategory: z.string().optional(),
  mimeType: z.string().optional(),
  drmProtected: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["title", "fileSize", "releaseDate", "rating", "createdAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const createLibrarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  allowedMediaTypes: z.array(z.string()).optional().default([]),
});

const updateLibrarySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  allowedMediaTypes: z.array(z.string()).optional(),
  hideDrmItems: z.boolean().optional(),
});

export function makeLibrariesRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /libraries — create library (manager+)
  router.post("/", requireRole("manager"), validate("json", createLibrarySchema), async (c) => {
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

  // GET /libraries — list accessible libraries (admin/manager see all; user/guest see granted)
  router.get("/", async (c) => {
    const user = c.get("user");
    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds === null) {
      const rows = await db.select().from(libraries);
      return c.json(rows);
    }
    if (accessibleIds.length === 0) return c.json([]);
    const rows = await db.select().from(libraries).where(inArray(libraries.id, accessibleIds));
    return c.json(rows);
  });

  // GET /libraries/:id — get single library with data sources (access-checked)
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const rows = await db.select().from(libraries).where(eq(libraries.id, id));
    if (rows.length === 0) return c.json({ error: "Not found" }, 404);

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds !== null && !accessibleIds.includes(id)) {
      return c.json({ error: "Not found" }, 404);
    }

    const sources = await db.select().from(dataSources).where(eq(dataSources.libraryId, id));
    return c.json({ ...rows[0], dataSources: sources });
  });

  // PUT /libraries/:id — update library (manager+)
  router.put("/:id", requireRole("manager"), validate("json", updateLibrarySchema), async (c) => {
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
    if (body.hideDrmItems !== undefined) updates.hideDrmItems = body.hideDrmItems;

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
  router.get("/:libraryId/media", validate("query", libraryMediaQuerySchema), async (c) => {
    const libraryId = c.req.param("libraryId") as string;
    const user = c.get("user");

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Not found" }, 404);

    const accessibleIds = await getAccessibleLibraryIds(db, user.id, user.role);
    if (accessibleIds !== null && !accessibleIds.includes(libraryId)) {
      return c.json({ error: "Not found" }, 404);
    }

    const { mediaCategory, mimeType, drmProtected, sortBy, order, page, limit } =
      c.req.valid("query");

    const pageNum = page;
    const limitNum = limit;
    const offset = (pageNum - 1) * limitNum;

    const ratingCond = await getContentRatingCondition(db, user.id);

    // Check if DRM items should be hidden (per library or per user preference)
    const userRows = await db
      .select({ hideDrmItems: users.hideDrmItems })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const userHidesDrm = userRows[0]?.hideDrmItems ?? false;
    const libHidesDrm = lib[0]?.hideDrmItems ?? false;

    const conditions = [eq(mediaItems.libraryId, libraryId)];
    if (mediaCategory) conditions.push(eq(mediaItems.mediaCategory, mediaCategory));
    if (mimeType) conditions.push(eq(mediaItems.mimeType, mimeType));
    if (drmProtected !== undefined) {
      conditions.push(eq(mediaItems.drmProtected, drmProtected === "true"));
    } else if (userHidesDrm || libHidesDrm) {
      conditions.push(eq(mediaItems.drmProtected, false));
    }
    if (ratingCond !== null) conditions.push(ratingCond);

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
