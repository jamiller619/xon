import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { signAccessToken } from "./auth.js";

const AUTH = `Bearer ${await signAccessToken("admin-id", "admin", "admin")}`;

describe("Admin Server Settings API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);
  });

  afterEach(() => {
    client.close();
  });

  // ---------------------------------------------------------------------------
  // GET /admin/server-settings
  // ---------------------------------------------------------------------------

  it("GET /admin/server-settings — returns defaults", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.corsEnabled).toBe(false);
    expect(body.corsAllowedOrigins).toEqual(["*"]);
    expect(body.rateLimitEnabled).toBe(true);
    expect(body.rateLimitGeneral).toBe(100);
    expect(body.rateLimitAuth).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // PUT /admin/server-settings
  // ---------------------------------------------------------------------------

  it("PUT /admin/server-settings — updates CORS settings", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        corsEnabled: true,
        corsAllowedOrigins: ["https://example.com", "https://app.example.com"],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.corsEnabled).toBe(true);
    expect(body.corsAllowedOrigins).toEqual(["https://example.com", "https://app.example.com"]);
    // Other fields unchanged
    expect(body.rateLimitEnabled).toBe(true);
    expect(body.rateLimitGeneral).toBe(100);
  });

  it("PUT /admin/server-settings — updates rate limit settings", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        rateLimitEnabled: false,
        rateLimitGeneral: 200,
        rateLimitAuth: 20,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateLimitEnabled).toBe(false);
    expect(body.rateLimitGeneral).toBe(200);
    expect(body.rateLimitAuth).toBe(20);
    // CORS unchanged
    expect(body.corsEnabled).toBe(false);
  });

  it("PUT /admin/server-settings — 400 on invalid body", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ rateLimitGeneral: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /admin/server-settings — 400 when rateLimitGeneral exceeds max", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ rateLimitGeneral: 99999 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET/PUT roundtrip persists all fields", async () => {
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        corsEnabled: true,
        corsAllowedOrigins: ["https://myapp.com"],
        rateLimitEnabled: true,
        rateLimitGeneral: 50,
        rateLimitAuth: 5,
      }),
    });

    const res = await app.request("/api/v1/admin/server-settings", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.corsEnabled).toBe(true);
    expect(body.corsAllowedOrigins).toEqual(["https://myapp.com"]);
    expect(body.rateLimitEnabled).toBe(true);
    expect(body.rateLimitGeneral).toBe(50);
    expect(body.rateLimitAuth).toBe(5);
  });
});

describe("Rate Limit Middleware", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Fresh db per test = fresh per-db rate limit store
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);
  });

  afterEach(() => {
    client.close();
  });

  it("returns X-RateLimit-* headers on requests", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.headers.get("x-ratelimit-limit")).not.toBeNull();
    expect(res.headers.get("x-ratelimit-remaining")).not.toBeNull();
    expect(res.headers.get("x-ratelimit-reset")).not.toBeNull();
  });

  it("rate limit headers show decreasing remaining count", async () => {
    const res1 = await app.request("/api/v1/health");
    const res2 = await app.request("/api/v1/health");
    const remaining1 = Number(res1.headers.get("x-ratelimit-remaining"));
    const remaining2 = Number(res2.headers.get("x-ratelimit-remaining"));
    expect(remaining2).toBeLessThan(remaining1);
  });

  it("returns 429 when general rate limit exceeded", async () => {
    // Set a very low rate limit
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: {
        Authorization: AUTH,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rateLimitGeneral: 1 }),
    });

    // First request: consumed the 1-per-minute slot (PUT above used 1 already,
    // so the first GET should hit the limit)
    // Keep making requests until we get 429
    let got429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/v1/health");
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});

describe("CORS Middleware", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Fresh db per test = fresh per-db rate limit store
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);
  });

  afterEach(() => {
    client.close();
  });

  it("no CORS headers by default (corsEnabled=false)", async () => {
    const res = await app.request("/api/v1/health", {
      headers: { Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns CORS headers when enabled with matching origin", async () => {
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        corsEnabled: true,
        corsAllowedOrigins: ["https://example.com"],
      }),
    });

    const res = await app.request("/api/v1/health", {
      headers: { Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });

  it("no CORS header for disallowed origin when CORS enabled", async () => {
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        corsEnabled: true,
        corsAllowedOrigins: ["https://example.com"],
      }),
    });

    const res = await app.request("/api/v1/health", {
      headers: { Origin: "https://evil.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
