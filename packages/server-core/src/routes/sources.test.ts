import { tmpdir } from "node:os";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";

describe("Data Sources CRUD API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let libraryId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    // Create a library to use in tests
    const res = await app.request("/api/v1/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Library" }),
    });
    const lib = await res.json();
    libraryId = lib.id;
  });

  afterEach(() => {
    client.close();
  });

  const tmpDir = tmpdir();

  function sourcesUrl(libId = libraryId) {
    return `/api/v1/libraries/${libId}/sources`;
  }

  async function createSource(
    data: { type: string; path: string; recursive?: boolean; enabled?: boolean },
    libId = libraryId
  ) {
    return app.request(sourcesUrl(libId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  describe("POST /api/v1/libraries/:libraryId/sources", () => {
    it("creates a network source and returns 201", async () => {
      const res = await createSource({ type: "network", path: "//nas/media" });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        libraryId,
        type: "network",
        path: "//nas/media",
        recursive: true,
        enabled: true,
      });
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("createdAt");
    });

    it("creates a local source with a valid path", async () => {
      const res = await createSource({ type: "local", path: tmpDir });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.type).toBe("local");
      expect(body.path).toBe(tmpDir);
    });

    it("returns 400 for local source with non-existent path", async () => {
      const res = await createSource({ type: "local", path: "/this/path/does/not/exist/ever" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing type", async () => {
      const res = await app.request(sourcesUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/some/path" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid type", async () => {
      const res = await app.request(sourcesUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ftp", path: "/some/path" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent library", async () => {
      const res = await createSource({ type: "network", path: "//nas/media" }, "nonexistent");
      expect(res.status).toBe(404);
    });

    it("respects recursive and enabled flags", async () => {
      const res = await createSource({
        type: "network",
        path: "//nas/music",
        recursive: false,
        enabled: false,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.recursive).toBe(false);
      expect(body.enabled).toBe(false);
    });
  });

  describe("GET /api/v1/libraries/:libraryId/sources", () => {
    it("returns empty array when no sources", async () => {
      const res = await app.request(sourcesUrl());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("lists all sources for the library", async () => {
      await createSource({ type: "network", path: "//nas/movies" });
      await createSource({ type: "network", path: "//nas/tv" });
      const res = await app.request(sourcesUrl());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });

    it("returns 404 for non-existent library", async () => {
      const res = await app.request(sourcesUrl("nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/v1/libraries/:libraryId/sources/:id", () => {
    it("updates source path", async () => {
      const created = await (await createSource({ type: "network", path: "//nas/old" })).json();
      const res = await app.request(`${sourcesUrl()}/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "//nas/new" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.path).toBe("//nas/new");
    });

    it("updates enabled flag", async () => {
      const created = await (await createSource({ type: "network", path: "//nas/media" })).json();
      const res = await app.request(`${sourcesUrl()}/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enabled).toBe(false);
    });

    it("returns 400 when updating local source path to non-existent path", async () => {
      const created = await (await createSource({ type: "local", path: tmpDir })).json();
      const res = await app.request(`${sourcesUrl()}/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/no/such/path/ever" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent source", async () => {
      const res = await app.request(`${sourcesUrl()}/nonexistent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "//nas/new" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/libraries/:libraryId/sources/:id", () => {
    it("deletes a source and returns success", async () => {
      const created = await (await createSource({ type: "network", path: "//nas/media" })).json();
      const res = await app.request(`${sourcesUrl()}/${created.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("deleted source no longer appears in list", async () => {
      const created = await (await createSource({ type: "network", path: "//nas/media" })).json();
      await app.request(`${sourcesUrl()}/${created.id}`, { method: "DELETE" });
      const res = await app.request(sourcesUrl());
      const body = await res.json();
      expect(body).toHaveLength(0);
    });

    it("returns 404 for non-existent source", async () => {
      const res = await app.request(`${sourcesUrl()}/nonexistent`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
