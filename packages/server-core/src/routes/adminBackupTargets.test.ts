import { copyFile, mkdir } from "node:fs/promises";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { backupTargets } from "../schema.js";
import { copyFilesToDestination, runBackupToTarget } from "./adminBackupTargets.js";
import { signAccessToken } from "./auth.js";

vi.mock("node:fs/promises", () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

const AUTH = `Bearer ${await signAccessToken("admin-id", "admin", "admin")}`;

describe("Backup Targets API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.close();
  });

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  it("GET /admin/backup/targets — returns empty list initially", async () => {
    const res = await app.request("/api/v1/admin/backup/targets", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  it("POST /admin/backup/targets — creates a local target", async () => {
    const res = await app.request("/api/v1/admin/backup/targets", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Local Backup",
        type: "local",
        config: { destPath: "/backups/media" },
        enabled: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Local Backup");
    expect(body.type).toBe("local");
    expect(JSON.parse(body.config)).toEqual({ destPath: "/backups/media" });
    expect(body.enabled).toBe(true);
    expect(body.id).toBeTruthy();
  });

  it("POST /admin/backup/targets — creates a network target", async () => {
    const res = await app.request("/api/v1/admin/backup/targets", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NAS Backup",
        type: "network",
        config: { mountPath: "/mnt/nas/backups" },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe("network");
    expect(JSON.parse(body.config)).toEqual({ mountPath: "/mnt/nas/backups" });
  });

  it("POST /admin/backup/targets — 400 on missing name", async () => {
    const res = await app.request("/api/v1/admin/backup/targets", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "local", config: {} }),
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Get single
  // ---------------------------------------------------------------------------

  it("GET /admin/backup/targets/:id — returns created target", async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: "Test",
      type: "local",
      config: '{"destPath":"/tmp"}',
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.name).toBe("Test");
  });

  it("GET /admin/backup/targets/:id — 404 for unknown id", async () => {
    const res = await app.request("/api/v1/admin/backup/targets/nonexistent", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it("PUT /admin/backup/targets/:id — updates fields", async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: "Old Name",
      type: "local",
      config: '{"destPath":"/old"}',
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
    expect(body.enabled).toBe(false);
  });

  it("PUT /admin/backup/targets/:id — 404 for unknown id", async () => {
    const res = await app.request("/api/v1/admin/backup/targets/nonexistent", {
      method: "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  it("DELETE /admin/backup/targets/:id — deletes existing target", async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: "To Delete",
      type: "local",
      config: "{}",
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      method: "DELETE",
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Confirm gone
    const check = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      headers: { Authorization: AUTH },
    });
    expect(check.status).toBe(404);
  });

  it("DELETE /admin/backup/targets/:id — 404 for unknown id", async () => {
    const res = await app.request("/api/v1/admin/backup/targets/nonexistent", {
      method: "DELETE",
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Backup copy logic unit tests
// ---------------------------------------------------------------------------

describe("copyFilesToDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
  });

  it("copies files and counts them", async () => {
    const result = await copyFilesToDestination(
      ["/media/movies/a.mkv", "/media/movies/b.mkv"],
      "/media",
      "/backup"
    );
    expect(result.copied).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledTimes(2);
    expect(copyFile).toHaveBeenCalledWith("/media/movies/a.mkv", "/backup/movies/a.mkv");
    expect(copyFile).toHaveBeenCalledWith("/media/movies/b.mkv", "/backup/movies/b.mkv");
  });

  it("records errors without throwing", async () => {
    vi.mocked(copyFile).mockRejectedValueOnce(new Error("Permission denied"));
    const result = await copyFilesToDestination(["/media/file.mkv"], "/media", "/backup");
    expect(result.copied).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Permission denied");
  });
});

describe("runBackupToTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
  });

  it("handles local target", async () => {
    const result = await runBackupToTarget(
      { type: "local", config: '{"destPath":"/backups"}' },
      ["/media/file.mkv"],
      "/media"
    );
    expect(result.copied).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledWith("/media/file.mkv", "/backups/file.mkv");
  });

  it("handles network target", async () => {
    const result = await runBackupToTarget(
      { type: "network", config: '{"mountPath":"/mnt/nas"}' },
      ["/media/file.mkv"],
      "/media"
    );
    expect(result.copied).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledWith("/media/file.mkv", "/mnt/nas/file.mkv");
  });

  it("returns error for invalid JSON config", async () => {
    const result = await runBackupToTarget(
      { type: "local", config: "not-json" },
      ["/media/file.mkv"],
      "/media"
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain("Invalid target config JSON");
  });

  it("returns error for local target missing destPath", async () => {
    const result = await runBackupToTarget(
      { type: "local", config: "{}" },
      ["/media/file.mkv"],
      "/media"
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain("Invalid local config");
  });

  it("returns error for unknown target type", async () => {
    const result = await runBackupToTarget(
      { type: "ftp", config: "{}" },
      ["/media/file.mkv"],
      "/media"
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain("Unknown target type");
  });
});
