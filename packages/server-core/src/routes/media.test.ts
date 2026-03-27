import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { dataSources, libraries, mediaItems } from "../schema.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

const { readFile } = await import("node:fs/promises");
const mockReadFile = vi.mocked(readFile);

describe("Media API - Thumbnail endpoint", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let mediaItemId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    // Create library, data source, and media item
    const libId = crypto.randomUUID();
    const now = new Date();
    await db.insert(libraries).values({
      id: libId,
      name: "Test Library",
      allowedMediaTypes: "[]",
      createdAt: now,
      updatedAt: now,
    });

    const sourceId = crypto.randomUUID();
    await db.insert(dataSources).values({
      id: sourceId,
      libraryId: libId,
      type: "local",
      path: "/media",
      recursive: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    mediaItemId = crypto.randomUUID();
    await db.insert(mediaItems).values({
      id: mediaItemId,
      libraryId: libId,
      dataSourceId: sourceId,
      filePath: "/media/photo.jpg",
      fileName: "photo.jpg",
      fileSize: 1000,
      mimeType: "image/jpeg",
      mediaCategory: "Pictures",
      thumbnailPaths: JSON.stringify({
        small: "/data/thumbnails/abc_small.jpg",
        medium: "/data/thumbnails/abc_medium.jpg",
        large: "/data/thumbnails/abc_large.jpg",
      }),
      createdAt: now,
      updatedAt: now,
    });

    mockReadFile.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id/thumbnail", () => {
    it("returns image with Content-Type image/jpeg for valid medium thumbnail", async () => {
      const fakeBuffer = Buffer.from("fake-image-data");
      mockReadFile.mockResolvedValueOnce(fakeBuffer as never);

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=medium`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    });

    it("includes Cache-Control header", async () => {
      const fakeBuffer = Buffer.from("fake-image-data");
      mockReadFile.mockResolvedValueOnce(fakeBuffer as never);

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=small`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    });

    it("defaults to medium when size is not specified", async () => {
      const fakeBuffer = Buffer.from("fake-image-data");
      mockReadFile.mockResolvedValueOnce(fakeBuffer as never);

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail`);
      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith("/data/thumbnails/abc_medium.jpg");
    });

    it("serves small thumbnail when size=small", async () => {
      const fakeBuffer = Buffer.from("fake-image-data");
      mockReadFile.mockResolvedValueOnce(fakeBuffer as never);

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=small`);
      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith("/data/thumbnails/abc_small.jpg");
    });

    it("serves large thumbnail when size=large", async () => {
      const fakeBuffer = Buffer.from("fake-image-data");
      mockReadFile.mockResolvedValueOnce(fakeBuffer as never);

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=large`);
      expect(res.status).toBe(200);
      expect(mockReadFile).toHaveBeenCalledWith("/data/thumbnails/abc_large.jpg");
    });

    it("returns 404 for unknown media item id", async () => {
      const res = await app.request("/api/v1/media/nonexistent-id/thumbnail?size=medium");
      expect(res.status).toBe(404);
    });

    it("returns 404 when media item has no thumbnailPaths", async () => {
      // Create a media item without thumbnails
      const [lib] = await db.select().from(libraries);
      const [source] = await db.select().from(dataSources);
      const noThumbId = crypto.randomUUID();
      const now = new Date();
      await db.insert(mediaItems).values({
        id: noThumbId,
        libraryId: lib?.id ?? "",
        dataSourceId: source?.id ?? "",
        filePath: "/media/plain.txt",
        fileName: "plain.txt",
        fileSize: 500,
        mimeType: "text/plain",
        mediaCategory: "Documents",
        thumbnailPaths: null,
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.request(`/api/v1/media/${noThumbId}/thumbnail?size=medium`);
      expect(res.status).toBe(404);
    });

    it("returns 404 when thumbnail file does not exist on disk", async () => {
      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }) as never
      );

      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=medium`);
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid size parameter", async () => {
      const res = await app.request(`/api/v1/media/${mediaItemId}/thumbnail?size=huge`);
      expect(res.status).toBe(400);
    });
  });
});
