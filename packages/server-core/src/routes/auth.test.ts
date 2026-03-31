import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { hashPassword } from "../password.js";
import { refreshTokens, users } from "../schema.js";

describe("Auth API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    // Create a test user
    await db.insert(users).values({
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
      displayName: "Test User",
      passwordHash: await hashPassword("password123"),
      role: "admin",
    });
  });

  afterEach(() => {
    client.close();
  });

  // ─── Login ──────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    it("returns 200 with access and refresh tokens on valid credentials", async () => {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("accessToken");
      expect(body).toHaveProperty("refreshToken");
      expect(typeof body.accessToken).toBe("string");
      expect(typeof body.refreshToken).toBe("string");
    });

    it("returns 401 for wrong password", async () => {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "wrongpass" }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    it("returns 401 for unknown username", async () => {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nobody", password: "password123" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing fields", async () => {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser" }),
      });
      expect(res.status).toBe(400);
    });

    it("stores a refresh token in the database on successful login", async () => {
      await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });

      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, "user-1"));
      expect(rows.length).toBe(1);
    });
  });

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/refresh", () => {
    async function login() {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });
      return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
    }

    it("returns new tokens with a valid refresh token", async () => {
      const { refreshToken } = await login();
      const res = await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("accessToken");
      expect(body).toHaveProperty("refreshToken");
    });

    it("rotates the refresh token (old token no longer valid)", async () => {
      const { refreshToken } = await login();

      // First refresh succeeds
      await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      // Second refresh with same token should fail
      const res2 = await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      expect(res2.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "not-a-valid-token" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when refresh token is missing", async () => {
      const res = await app.request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/logout", () => {
    async function login() {
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });
      return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
    }

    it("returns 200 and removes refresh token from DB", async () => {
      const { refreshToken } = await login();

      const res = await app.request("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("message");

      // Token is removed from DB
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, "user-1"));
      expect(rows.length).toBe(0);
    });

    it("returns 200 even with an invalid token (no information leakage)", async () => {
      const res = await app.request("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "not-a-valid-token" }),
      });
      expect(res.status).toBe(200);
    });

    it("returns 400 when refresh token is missing", async () => {
      const res = await app.request("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Auth Middleware ─────────────────────────────────────────────────────────

  describe("Auth middleware", () => {
    it("returns 401 for protected routes without token", async () => {
      const res = await app.request("/api/v1/libraries");
      expect(res.status).toBe(401);
    });

    it("allows access with valid access token", async () => {
      const loginRes = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });
      const { accessToken } = (await loginRes.json()) as {
        accessToken: string;
        refreshToken: string;
      };

      const res = await app.request("/api/v1/libraries", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status).toBe(200);
    });

    it("returns 401 with a tampered token", async () => {
      const res = await app.request("/api/v1/libraries", {
        headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.tampered.signature" },
      });
      expect(res.status).toBe(401);
    });

    it("health check does not require auth", async () => {
      const res = await app.request("/api/v1/health");
      expect(res.status).toBe(200);
    });

    it("auth routes do not require token", async () => {
      // Login route is accessible without token
      const res = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "password123" }),
      });
      expect(res.status).toBe(200);
    });
  });
});

// ─── Setup endpoints (empty DB) ──────────────────────────────────────────────

describe("Setup API (first-time setup)", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);
    // No users inserted — empty database
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/auth/setup-status", () => {
    it("returns setupComplete: false when no users exist", async () => {
      const res = await app.request("/api/v1/auth/setup-status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ setupComplete: false });
    });

    it("returns setupComplete: true when users exist", async () => {
      await db.insert(users).values({
        id: "u1",
        username: "admin",
        email: "admin@localhost",
        displayName: "Admin",
        passwordHash: await hashPassword("password"),
        role: "admin",
      });
      const res = await app.request("/api/v1/auth/setup-status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ setupComplete: true });
    });
  });

  describe("POST /api/v1/auth/setup", () => {
    it("creates the first admin user and returns tokens", async () => {
      const res = await app.request("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "password123", displayName: "Admin" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty("accessToken");
      expect(body).toHaveProperty("refreshToken");
    });

    it("returns 409 if users already exist", async () => {
      await db.insert(users).values({
        id: "u1",
        username: "existing",
        email: "existing@localhost",
        displayName: "Existing",
        passwordHash: await hashPassword("password"),
        role: "admin",
      });
      const res = await app.request("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "password123", displayName: "Admin" }),
      });
      expect(res.status).toBe(409);
    });

    it("returns 400 for short password (< 8 chars)", async () => {
      const res = await app.request("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "short", displayName: "Admin" }),
      });
      expect(res.status).toBe(400);
    });

    it("the created user can log in via /auth/login", async () => {
      await app.request("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "password123", displayName: "Admin" }),
      });

      const loginRes = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "password123" }),
      });
      expect(loginRes.status).toBe(200);
    });
  });
});
