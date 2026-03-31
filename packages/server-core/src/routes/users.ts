import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../password.js";
import { apiTokens, favorites, mediaItems, mediaProgress, users, watchlist } from "../schema.js";
import { validate } from "../validate.js";
import { withThumbnailUrls } from "./media.js";

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function makeUsersRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // GET /users/me — get current user profile (no password hash)
  router.get("/me", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        maxContentRating: users.maxContentRating,
        hideDrmItems: users.hideDrmItems,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json(rows[0]);
  });

  // PATCH /users/me — update current user preferences (legacy, kept for backwards compat)
  router.patch(
    "/me",
    validate("json", z.object({ hideDrmItems: z.boolean().optional() })),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (body.hideDrmItems !== undefined) updates.hideDrmItems = body.hideDrmItems;
      await db.update(users).set(updates).where(eq(users.id, user.id));
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          role: users.role,
          maxContentRating: users.maxContentRating,
          hideDrmItems: users.hideDrmItems,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      return c.json(rows[0]);
    }
  );

  const profileUpdateSchema = z.object({
    displayName: z.string().min(1).max(128).optional(),
    email: z.string().email().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    maxContentRating: z.enum(["G", "PG", "PG-13", "R", "unrated", "none"]).optional(),
    hideDrmItems: z.boolean().optional(),
  });

  // PUT /users/me — update full profile and preferences
  router.put("/me", validate("json", profileUpdateSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.email !== undefined) updates.email = body.email;
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl ?? undefined;
    if (body.maxContentRating !== undefined) updates.maxContentRating = body.maxContentRating;
    if (body.hideDrmItems !== undefined) updates.hideDrmItems = body.hideDrmItems;
    await db.update(users).set(updates).where(eq(users.id, user.id));
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        maxContentRating: users.maxContentRating,
        hideDrmItems: users.hideDrmItems,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json(rows[0]);
  });

  // PUT /users/me/password — change current user's password
  router.put(
    "/me/password",
    validate(
      "json",
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
    ),
    async (c) => {
      const user = c.get("user");
      const { currentPassword, newPassword } = c.req.valid("json");

      const rows = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!rows[0]) return c.json({ error: "Not found" }, 404);

      const valid = await verifyPassword(rows[0].passwordHash, currentPassword);
      if (!valid) return c.json({ error: "Current password is incorrect" }, 400);

      const newHash = await hashPassword(newPassword);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return c.json({ message: "Password updated" });
    }
  );

  // GET /users/me/progress — list in-progress (not completed) items for the current user
  router.get("/me/progress", async (c) => {
    const user = c.get("user");

    const rows = await db
      .select({
        userId: mediaProgress.userId,
        mediaItemId: mediaProgress.mediaItemId,
        position: mediaProgress.position,
        duration: mediaProgress.duration,
        completed: mediaProgress.completed,
        updatedAt: mediaProgress.updatedAt,
        mediaItem: mediaItems,
      })
      .from(mediaProgress)
      .innerJoin(mediaItems, eq(mediaProgress.mediaItemId, mediaItems.id))
      .where(
        and(
          eq(mediaProgress.userId, user.id),
          or(eq(mediaProgress.completed, false), isNull(mediaProgress.completed))
        )
      )
      .orderBy(desc(mediaProgress.updatedAt));

    return c.json(
      rows.map((r) => ({
        mediaItemId: r.mediaItemId,
        position: r.position,
        duration: r.duration,
        completed: r.completed,
        updatedAt: r.updatedAt,
        mediaItem: withThumbnailUrls(r.mediaItem),
      }))
    );
  });

  // GET /users/me/favorites — list favorited items for the current user
  router.get("/me/favorites", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({ mediaItem: mediaItems })
      .from(favorites)
      .innerJoin(mediaItems, eq(favorites.mediaItemId, mediaItems.id))
      .where(eq(favorites.userId, user.id))
      .orderBy(desc(favorites.createdAt));
    return c.json(rows.map((r) => withThumbnailUrls(r.mediaItem)));
  });

  // GET /users/me/watchlist — list watchlist items for the current user
  router.get("/me/watchlist", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({ mediaItem: mediaItems })
      .from(watchlist)
      .innerJoin(mediaItems, eq(watchlist.mediaItemId, mediaItems.id))
      .where(eq(watchlist.userId, user.id))
      .orderBy(desc(watchlist.createdAt));
    return c.json(rows.map((r) => withThumbnailUrls(r.mediaItem)));
  });

  // POST /users/me/tokens — generate a new API token (returned once)
  router.post(
    "/me/tokens",
    validate(
      "json",
      z.object({
        name: z.string().min(1).max(100),
        expiresAt: z.string().datetime().optional(),
      })
    ),
    async (c) => {
      const user = c.get("user");
      const { name, expiresAt } = c.req.valid("json");

      // Generate a random 32-byte token with "xon_" prefix
      const rawToken = `xon_${randomBytes(32).toString("hex")}`;
      const tokenHash = hashApiToken(rawToken);
      const id = crypto.randomUUID();

      await db.insert(apiTokens).values({
        id,
        userId: user.id,
        name,
        tokenHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      return c.json({ id, name, token: rawToken, expiresAt: expiresAt ?? null }, 201);
    }
  );

  // GET /users/me/tokens — list tokens (names only, not values)
  router.get("/me/tokens", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id))
      .orderBy(desc(apiTokens.createdAt));
    return c.json(rows);
  });

  // DELETE /users/me/tokens/:id — revoke token
  router.delete("/me/tokens/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const rows = await db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)))
      .limit(1);

    if (!rows[0]) {
      return c.json({ error: "Token not found" }, 404);
    }

    await db.delete(apiTokens).where(eq(apiTokens.id, id));
    return c.json({ message: "Token revoked" });
  });

  return router;
}
