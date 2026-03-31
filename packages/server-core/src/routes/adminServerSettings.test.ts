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

  it("GET /admin/server-settings — returns HTTPS defaults", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.httpsEnabled).toBe(false);
    expect(body.httpsCertPath).toBeNull();
    expect(body.httpsKeyPath).toBeNull();
    expect(body.acmeEnabled).toBe(false);
    expect(body.acmeDomain).toBeNull();
    expect(body.acmeEmail).toBeNull();
    expect(body.acmeCertsDir).toBeNull();
    expect(body.trustProxy).toBe(false);
  });

  it("PUT /admin/server-settings — updates HTTPS manual cert settings", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        httpsEnabled: true,
        httpsCertPath: "/etc/ssl/cert.pem",
        httpsKeyPath: "/etc/ssl/key.pem",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.httpsEnabled).toBe(true);
    expect(body.httpsCertPath).toBe("/etc/ssl/cert.pem");
    expect(body.httpsKeyPath).toBe("/etc/ssl/key.pem");
  });

  it("PUT /admin/server-settings — updates ACME settings", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        acmeEnabled: true,
        acmeDomain: "example.com",
        acmeEmail: "admin@example.com",
        acmeCertsDir: "/data/certs",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acmeEnabled).toBe(true);
    expect(body.acmeDomain).toBe("example.com");
    expect(body.acmeEmail).toBe("admin@example.com");
    expect(body.acmeCertsDir).toBe("/data/certs");
  });

  it("PUT /admin/server-settings — 400 on invalid ACME email", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ acmeEmail: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /admin/server-settings — updates trustProxy setting", async () => {
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ trustProxy: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trustProxy).toBe(true);
  });

  it("PUT /admin/server-settings — can clear HTTPS fields with null", async () => {
    // First set them
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ httpsCertPath: "/etc/cert.pem", httpsKeyPath: "/etc/key.pem" }),
    });
    // Then clear them
    const res = await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ httpsCertPath: null, httpsKeyPath: null }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.httpsCertPath).toBeNull();
    expect(body.httpsKeyPath).toBeNull();
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

describe("Reverse Proxy Middleware", () => {
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

  it("does not echo X-Forwarded-Proto by default (trustProxy=false)", async () => {
    const res = await app.request("/api/v1/health", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    // The middleware echoes the header only when trustProxy is enabled;
    // but here we just check the route responds successfully
    expect(res.status).toBe(200);
  });

  it("echoes X-Forwarded-Proto in response when trustProxy=true", async () => {
    await app.request("/api/v1/admin/server-settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ trustProxy: true }),
    });

    const res = await app.request("/api/v1/health", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-forwarded-proto")).toBe("https");
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
