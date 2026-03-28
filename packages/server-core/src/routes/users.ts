import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { favorites, mediaItems, mediaProgress, watchlist } from "../schema.js";
import { withThumbnailUrls } from "./media.js";

export function makeUsersRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

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

  return router;
}
