import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { signAccessToken } from "./auth.js";

const AUTH = `Bearer ${await signAccessToken("admin-id", "admin", "admin")}`;

describe("Admin Settings API", () => {
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
  // GET /admin/settings
  // ---------------------------------------------------------------------------

  it("GET /admin/settings — returns defaults", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverPort).toBe(32400);
    expect(body.dataDirectory).toBe("./data");
    expect(body.defaultScanSchedule).toBeNull();
    expect(body.thumbnailSizes).toEqual(["small", "medium"]);
    expect(body.requiresRestart).toBe(false);
  });

  it("GET /admin/settings — requires admin auth", async () => {
    const userAuth = `Bearer ${await signAccessToken("user-id", "user", "user")}`;
    const res = await app.request("/api/v1/admin/settings", {
      headers: { Authorization: userAuth },
    });
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // PUT /admin/settings
  // ---------------------------------------------------------------------------

  it("PUT /admin/settings — updates port and returns requiresRestart=true", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ serverPort: 8080 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverPort).toBe(8080);
    expect(body.requiresRestart).toBe(true);
  });

  it("PUT /admin/settings — updates dataDirectory and returns requiresRestart=true", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ dataDirectory: "/mnt/data/xon" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataDirectory).toBe("/mnt/data/xon");
    expect(body.requiresRestart).toBe(true);
  });

  it("PUT /admin/settings — updates scan schedule (no restart)", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultScanSchedule: "0 2 * * *" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultScanSchedule).toBe("0 2 * * *");
    expect(body.requiresRestart).toBe(false);
  });

  it("PUT /admin/settings — clears scan schedule with null", async () => {
    await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultScanSchedule: "0 2 * * *" }),
    });
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultScanSchedule: null }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultScanSchedule).toBeNull();
  });

  it("PUT /admin/settings — updates thumbnail sizes (no restart)", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnailSizes: ["small", "medium", "large"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thumbnailSizes).toEqual(["small", "medium", "large"]);
    expect(body.requiresRestart).toBe(false);
  });

  it("PUT /admin/settings — same port value does not set requiresRestart", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ serverPort: 32400 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresRestart).toBe(false);
  });

  it("PUT /admin/settings — rejects invalid port", async () => {
    const res = await app.request("/api/v1/admin/settings", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ serverPort: 99999 }),
    });
    expect(res.status).toBe(400);
  });
});
