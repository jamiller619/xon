import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { hashPassword } from "../password.js";
import { signAccessToken } from "../routes/auth.js";
import { libraries, libraryAccess, users } from "../schema.js";

const ADMIN_AUTH = `Bearer ${await signAccessToken("admin-1", "admin", "admin")}`;
const USER_AUTH = `Bearer ${await signAccessToken("user-1", "regularuser", "user")}`;

describe("Admin Library Access API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    await db.insert(users).values({
      id: "admin-1",
      username: "admin",
      email: "admin@example.com",
      displayName: "Admin User",
      passwordHash: await hashPassword("admin123"),
      role: "admin",
    });

    await db.insert(users).values({
      id: "user-1",
      username: "regularuser",
      email: "user@example.com",
      displayName: "Regular User",
      passwordHash: await hashPassword("user123"),
      role: "user",
    });

    await db.insert(libraries).values({
      id: "lib-1",
      name: "Movies",
      allowedMediaTypes: "[]",
    });

    await db.insert(libraries).values({
      id: "lib-2",
      name: "Music",
      allowedMediaTypes: "[]",
    });
  });

  afterEach(() => {
    client.close();
  });

  // ─── GET /admin/libraries/:libraryId/access ─────────────────────────────────

  describe("GET /api/v1/admin/libraries/:libraryId/access", () => {
    it("returns 200 with empty list when no grants", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns users with access after grant", async () => {
      await db.insert(libraryAccess).values({
        userId: "user-1",
        libraryId: "lib-1",
        grantedAt: new Date(),
        grantedBy: "admin-1",
      });

      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        userId: "user-1",
        libraryId: "lib-1",
        username: "regularuser",
      });
    });

    it("returns 404 for unknown library", async () => {
      const res = await app.request("/api/v1/admin/libraries/nonexistent/access", {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for non-admin", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /admin/libraries/:libraryId/access ────────────────────────────────

  describe("POST /api/v1/admin/libraries/:libraryId/access", () => {
    it("grants access and returns 201", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ADMIN_AUTH },
        body: JSON.stringify({ userId: "user-1" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({ userId: "user-1", libraryId: "lib-1" });

      // verify in DB
      const rows = await db.select().from(libraryAccess);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: "user-1", libraryId: "lib-1", grantedBy: "admin-1" });
    });

    it("is idempotent — duplicate grant does not error", async () => {
      await app.request("/api/v1/admin/libraries/lib-1/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ADMIN_AUTH },
        body: JSON.stringify({ userId: "user-1" }),
      });

      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ADMIN_AUTH },
        body: JSON.stringify({ userId: "user-1" }),
      });
      expect(res.status).toBe(201);
      const rows = await db.select().from(libraryAccess);
      expect(rows).toHaveLength(1);
    });

    it("returns 404 for unknown library", async () => {
      const res = await app.request("/api/v1/admin/libraries/nonexistent/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ADMIN_AUTH },
        body: JSON.stringify({ userId: "user-1" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for unknown user", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: ADMIN_AUTH },
        body: JSON.stringify({ userId: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for non-admin", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: USER_AUTH },
        body: JSON.stringify({ userId: "user-1" }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE /admin/libraries/:libraryId/access/:userId ─────────────────────

  describe("DELETE /api/v1/admin/libraries/:libraryId/access/:userId", () => {
    beforeEach(async () => {
      await db.insert(libraryAccess).values({
        userId: "user-1",
        libraryId: "lib-1",
        grantedAt: new Date(),
        grantedBy: "admin-1",
      });
    });

    it("revokes access and returns success", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access/user-1", {
        method: "DELETE",
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ success: true });

      const rows = await db.select().from(libraryAccess);
      expect(rows).toHaveLength(0);
    });

    it("returns 404 for unknown library", async () => {
      const res = await app.request("/api/v1/admin/libraries/nonexistent/access/user-1", {
        method: "DELETE",
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for non-admin", async () => {
      const res = await app.request("/api/v1/admin/libraries/lib-1/access/user-1", {
        method: "DELETE",
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(403);
    });

    it("only removes the specific library grant, not others", async () => {
      await db.insert(libraryAccess).values({
        userId: "user-1",
        libraryId: "lib-2",
        grantedAt: new Date(),
        grantedBy: "admin-1",
      });

      const res = await app.request("/api/v1/admin/libraries/lib-1/access/user-1", {
        method: "DELETE",
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);

      const rows = await db.select().from(libraryAccess);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ libraryId: "lib-2" });
    });
  });
});
