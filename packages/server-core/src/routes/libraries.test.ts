import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";

describe("Libraries CRUD API", () => {
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

  // Helper to create a library
  async function createLibrary(
    data: { name: string; description?: string; allowedMediaTypes?: string[] } = {
      name: "Test Library",
    }
  ) {
    return app.request("/api/v1/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  describe("POST /api/v1/libraries", () => {
    it("creates a library and returns 201", async () => {
      const res = await createLibrary({
        name: "My Movies",
        description: "Movie collection",
        allowedMediaTypes: ["Movies"],
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        name: "My Movies",
        description: "Movie collection",
        allowedMediaTypes: '["Movies"]',
      });
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("createdAt");
    });

    it("creates a library with defaults for optional fields", async () => {
      const res = await createLibrary({ name: "Minimal Library" });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Minimal Library");
      expect(body.allowedMediaTypes).toBe("[]");
      expect(body.description).toBeNull();
    });

    it("returns 400 for missing name", async () => {
      const res = await app.request("/api/v1/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "no name" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty name", async () => {
      const res = await app.request("/api/v1/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/libraries", () => {
    it("returns empty array when no libraries exist", async () => {
      const res = await app.request("/api/v1/libraries");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("lists all libraries", async () => {
      await createLibrary({ name: "Library 1" });
      await createLibrary({ name: "Library 2" });
      const res = await app.request("/api/v1/libraries");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.map((l: { name: string }) => l.name)).toContain("Library 1");
      expect(body.map((l: { name: string }) => l.name)).toContain("Library 2");
    });
  });

  describe("GET /api/v1/libraries/:id", () => {
    it("returns library with empty dataSources array", async () => {
      const created = await (await createLibrary({ name: "Detail Library" })).json();
      const res = await app.request(`/api/v1/libraries/${created.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(created.id);
      expect(body.name).toBe("Detail Library");
      expect(body.dataSources).toEqual([]);
    });

    it("returns 404 for unknown id", async () => {
      const res = await app.request("/api/v1/libraries/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/v1/libraries/:id", () => {
    it("updates library name", async () => {
      const created = await (await createLibrary({ name: "Old Name" })).json();
      const res = await app.request(`/api/v1/libraries/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("New Name");
    });

    it("updates allowedMediaTypes", async () => {
      const created = await (await createLibrary({ name: "Library" })).json();
      const res = await app.request(`/api/v1/libraries/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedMediaTypes: ["Movies", "TV Shows"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.allowedMediaTypes).toBe('["Movies","TV Shows"]');
    });

    it("returns 404 for unknown id", async () => {
      const res = await app.request("/api/v1/libraries/nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/libraries/:id", () => {
    it("deletes a library and returns success", async () => {
      const created = await (await createLibrary({ name: "To Delete" })).json();
      const res = await app.request(`/api/v1/libraries/${created.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("deleted library is no longer found", async () => {
      const created = await (await createLibrary({ name: "Gone" })).json();
      await app.request(`/api/v1/libraries/${created.id}`, { method: "DELETE" });
      const res = await app.request(`/api/v1/libraries/${created.id}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 for unknown id", async () => {
      const res = await app.request("/api/v1/libraries/nonexistent", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
