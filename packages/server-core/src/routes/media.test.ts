import { Readable } from "node:stream";
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
  stat: vi.fn(),
}));

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
}));

const { readFile, stat } = await import("node:fs/promises");
const { createReadStream } = await import("node:fs");
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);
const mockCreateReadStream = vi.mocked(createReadStream);

describe("Media API - Detail endpoint", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let mediaItemId: string;
  let noThumbItemId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

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

    noThumbItemId = crypto.randomUUID();
    await db.insert(mediaItems).values({
      id: noThumbItemId,
      libraryId: libId,
      dataSourceId: sourceId,
      filePath: "/media/doc.pdf",
      fileName: "doc.pdf",
      fileSize: 500,
      mimeType: "application/pdf",
      mediaCategory: "Documents",
      thumbnailPaths: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id", () => {
    it("returns media item with thumbnailUrls when thumbnails exist", async () => {
      const res = await app.request(`/api/v1/media/${mediaItemId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(mediaItemId);
      expect(body.fileName).toBe("photo.jpg");
      expect(body.thumbnailUrls).toMatchObject({
        small: `/api/v1/media/${mediaItemId}/thumbnail?size=small`,
        medium: `/api/v1/media/${mediaItemId}/thumbnail?size=medium`,
        large: `/api/v1/media/${mediaItemId}/thumbnail?size=large`,
      });
    });

    it("returns null thumbnailUrls when item has no thumbnails", async () => {
      const res = await app.request(`/api/v1/media/${noThumbItemId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(noThumbItemId);
      expect(body.thumbnailUrls).toBeNull();
    });

    it("returns 404 for unknown id", async () => {
      const res = await app.request("/api/v1/media/nonexistent-id");
      expect(res.status).toBe(404);
    });
  });
});

describe("Media API - PUT /api/v1/media/:id", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let mediaItemId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

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
      filePath: "/media/movie.mp4",
      fileName: "movie.mp4",
      fileSize: 5000,
      mimeType: "video/mp4",
      mediaCategory: "Movies",
      title: "Original Title",
      description: "Original description",
      metadata: JSON.stringify({ director: "Someone", tags: ["action"] }),
      thumbnailPaths: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    client.close();
  });

  it("updates title", async () => {
    const res = await app.request(`/api/v1/media/${mediaItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New Title");
    expect(body.description).toBe("Original description");
  });

  it("updates description", async () => {
    const res = await app.request(`/api/v1/media/${mediaItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "New description" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("New description");
    expect(body.title).toBe("Original Title");
  });

  it("updates tags within metadata preserving other fields", async () => {
    const res = await app.request(`/api/v1/media/${mediaItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["action", "drama"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const meta = JSON.parse(body.metadata) as Record<string, unknown>;
    expect(meta.tags).toEqual(["action", "drama"]);
    expect(meta.director).toBe("Someone");
  });

  it("returns 404 for unknown id", async () => {
    const res = await app.request("/api/v1/media/nonexistent-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await app.request(`/api/v1/media/${mediaItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });
});

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

describe("Media API - Stream endpoint", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let videoItemId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

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

    videoItemId = crypto.randomUUID();
    await db.insert(mediaItems).values({
      id: videoItemId,
      libraryId: libId,
      dataSourceId: sourceId,
      filePath: "/media/movie.mp4",
      fileName: "movie.mp4",
      fileSize: 10000,
      mimeType: "video/mp4",
      mediaCategory: "Movies",
      thumbnailPaths: null,
      createdAt: now,
      updatedAt: now,
    });

    mockStat.mockReset();
    mockCreateReadStream.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id/stream", () => {
    it("returns 404 for unknown media item", async () => {
      const res = await app.request("/api/v1/media/nonexistent-id/stream");
      expect(res.status).toBe(404);
    });

    it("returns 404 when file is not accessible on disk", async () => {
      mockStat.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }) as never
      );
      const res = await app.request(`/api/v1/media/${videoItemId}/stream`);
      expect(res.status).toBe(404);
    });

    it("returns 200 with full file when no Range header", async () => {
      mockStat.mockResolvedValueOnce({ size: 10000 } as never);
      const fakeStream = Readable.from(["fake video data"]);
      mockCreateReadStream.mockReturnValueOnce(fakeStream as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Content-Length")).toBe("10000");
    });

    it("returns 206 with partial content for Range request", async () => {
      mockStat.mockResolvedValueOnce({ size: 10000 } as never);
      const fakeStream = Readable.from(["chunk"]);
      mockCreateReadStream.mockReturnValueOnce(fakeStream as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`, {
        headers: { Range: "bytes=0-1023" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Content-Range")).toBe("bytes 0-1023/10000");
      expect(res.headers.get("Content-Length")).toBe("1024");
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    });

    it("returns 206 to end of file when range end is omitted", async () => {
      mockStat.mockResolvedValueOnce({ size: 10000 } as never);
      const fakeStream = Readable.from(["tail"]);
      mockCreateReadStream.mockReturnValueOnce(fakeStream as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`, {
        headers: { Range: "bytes=9000-" },
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 9000-9999/10000");
      expect(res.headers.get("Content-Length")).toBe("1000");
    });

    it("returns 416 when range is out of bounds", async () => {
      mockStat.mockResolvedValueOnce({ size: 10000 } as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`, {
        headers: { Range: "bytes=9999-10000" },
      });
      expect(res.status).toBe(416);
    });
  });
});
