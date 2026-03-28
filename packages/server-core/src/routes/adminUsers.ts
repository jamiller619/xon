import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { hashPassword } from "../password.js";
import { users } from "../schema.js";

const createUserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(["admin", "manager", "user", "guest"]).default("user"),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "manager", "user", "guest"]).optional(),
  password: z.string().min(1).optional(),
});

export function makeAdminUsersRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // GET /admin/users — list all users
  router.get("/", async (c) => {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users);
    return c.json(rows);
  });

  // POST /admin/users — create user
  router.post("/", zValidator("json", createUserSchema), async (c) => {
    const body = c.req.valid("json");

    const id = crypto.randomUUID();
    const now = new Date();
    const passwordHash = await hashPassword(body.password);

    await db.insert(users).values({
      id,
      username: body.username,
      email: body.email,
      displayName: body.displayName,
      passwordHash,
      role: body.role,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id));
    return c.json(rows[0], 201);
  });

  // PUT /admin/users/:id — update user
  router.put("/:id", zValidator("json", updateUserSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await db.select().from(users).where(eq(users.id, id));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.email !== undefined) updates.email = body.email;
    if (body.role !== undefined) updates.role = body.role;
    if (body.password !== undefined) updates.passwordHash = await hashPassword(body.password);

    await db.update(users).set(updates).where(eq(users.id, id));
    const updated = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id));
    return c.json(updated[0]);
  });

  // DELETE /admin/users/:id — delete user
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");

    const existing = await db.select().from(users).where(eq(users.id, id));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true });
  });

  return router;
}
