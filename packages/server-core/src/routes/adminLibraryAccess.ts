import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { libraries, libraryAccess, users } from "../schema.js";

const grantSchema = z.object({
  userId: z.string().min(1),
});

export function makeAdminLibraryAccessRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // GET /admin/libraries/:libraryId/access — list users with access to a library
  router.get("/:libraryId/access", async (c) => {
    const libraryId = c.req.param("libraryId");

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Not found" }, 404);

    const rows = await db
      .select({
        userId: libraryAccess.userId,
        libraryId: libraryAccess.libraryId,
        grantedAt: libraryAccess.grantedAt,
        grantedBy: libraryAccess.grantedBy,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
      })
      .from(libraryAccess)
      .innerJoin(users, eq(users.id, libraryAccess.userId))
      .where(eq(libraryAccess.libraryId, libraryId));

    return c.json(rows);
  });

  // POST /admin/libraries/:libraryId/access — grant a user access to a library
  router.post("/:libraryId/access", zValidator("json", grantSchema), async (c) => {
    const libraryId = c.req.param("libraryId");
    const body = c.req.valid("json");
    const adminUser = c.get("user");

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Not found" }, 404);

    const userRows = await db.select().from(users).where(eq(users.id, body.userId));
    if (userRows.length === 0) return c.json({ error: "User not found" }, 404);

    await db
      .insert(libraryAccess)
      .values({
        userId: body.userId,
        libraryId,
        grantedAt: new Date(),
        grantedBy: adminUser.id,
      })
      .onConflictDoNothing();

    return c.json({ userId: body.userId, libraryId }, 201);
  });

  // DELETE /admin/libraries/:libraryId/access/:userId — revoke a user's access
  router.delete("/:libraryId/access/:userId", async (c) => {
    const libraryId = c.req.param("libraryId");
    const userId = c.req.param("userId");

    const lib = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (lib.length === 0) return c.json({ error: "Not found" }, 404);

    await db
      .delete(libraryAccess)
      .where(and(eq(libraryAccess.userId, userId), eq(libraryAccess.libraryId, libraryId)));

    return c.json({ success: true });
  });

  return router;
}
