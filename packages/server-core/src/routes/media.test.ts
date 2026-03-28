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
  readdir: vi.fn(),
}));

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
}));

vi.mock("../ffprobe.js", () => ({
  extractStreamTracks: vi.fn(),
  extractFfprobeMetadata: vi.fn(),
  isAudioVideoCategory: vi.fn(),
}));

vi.mock("../transcode.js", () => ({
  needsTranscoding: vi.fn(),
  generateHlsPlaylist: vi.fn(),
  spawnTranscodeSegment: vi.fn(),
}));

vi.mock("../raw.js", () => ({
  isRawImage: vi.fn(),
  convertRawToJpeg: vi.fn(),
}));

const { readFile, stat, readdir } = await import("node:fs/promises");
const { createReadStream } = await import("node:fs");
const { extractStreamTracks, extractFfprobeMetadata } = await import("../ffprobe.js");
const { needsTranscoding, generateHlsPlaylist, spawnTranscodeSegment } = await import(
  "../transcode.js"
);
const { isRawImage, convertRawToJpeg } = await import("../raw.js");
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);
const mockCreateReadStream = vi.mocked(createReadStream);
const mockReaddir = vi.mocked(readdir);
const mockExtractStreamTracks = vi.mocked(extractStreamTracks);
const mockExtractFfprobeMetadata = vi.mocked(extractFfprobeMetadata);
const mockNeedsTranscoding = vi.mocked(needsTranscoding);
const mockGenerateHlsPlaylist = vi.mocked(generateHlsPlaylist);
const mockSpawnTranscodeSegment = vi.mocked(spawnTranscodeSegment);
const mockIsRawImage = vi.mocked(isRawImage);
const mockConvertRawToJpeg = vi.mocked(convertRawToJpeg);

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

describe("Media API - Tracks endpoint", () => {
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

    mockExtractStreamTracks.mockReset();
    mockReaddir.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id/tracks", () => {
    it("returns 404 for unknown media item", async () => {
      const res = await app.request("/api/v1/media/nonexistent-id/tracks");
      expect(res.status).toBe(404);
    });

    it("returns audio and subtitle tracks from ffprobe and directory scan", async () => {
      mockExtractStreamTracks.mockResolvedValueOnce([
        { index: 0, codecType: "audio", codec: "aac", language: "en", title: "English" },
        { index: 1, codecType: "audio", codec: "ac3", language: "fr" },
        { index: 2, codecType: "subtitle", codec: "subrip", language: "en", title: "English" },
      ]);
      mockReaddir.mockResolvedValueOnce(["movie.en.srt", "movie.fr.vtt", "other.jpg"] as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/tracks`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { audioTracks: unknown[]; subtitleTracks: unknown[] };
      expect(body.audioTracks).toHaveLength(2);
      expect(body.audioTracks[0]).toMatchObject({ index: 0, codec: "aac", language: "en" });
      expect(body.audioTracks[1]).toMatchObject({ index: 1, codec: "ac3", language: "fr" });
      // embedded sub + 2 external (.srt and .vtt, not .jpg)
      expect(body.subtitleTracks).toHaveLength(3);
      expect(body.subtitleTracks[0]).toMatchObject({ type: "embedded", index: 2, codec: "subrip" });
      expect(body.subtitleTracks[1]).toMatchObject({ type: "external", file: "movie.en.srt" });
      expect(body.subtitleTracks[2]).toMatchObject({ type: "external", file: "movie.fr.vtt" });
    });

    it("returns empty tracks when ffprobe fails and directory is unreadable", async () => {
      mockExtractStreamTracks.mockResolvedValueOnce([]);
      mockReaddir.mockRejectedValueOnce(new Error("EACCES") as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/tracks`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { audioTracks: unknown[]; subtitleTracks: unknown[] };
      expect(body.audioTracks).toHaveLength(0);
      expect(body.subtitleTracks).toHaveLength(0);
    });

    it("only includes .srt and .vtt files matching base name", async () => {
      mockExtractStreamTracks.mockResolvedValueOnce([]);
      mockReaddir.mockResolvedValueOnce([
        "movie.srt",
        "movie.vtt",
        "other-movie.srt",
        "movie.mp4",
        "movie.jpg",
      ] as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/tracks`);
      const body = (await res.json()) as { subtitleTracks: { file: string }[] };
      const files = body.subtitleTracks.map((t) => t.file);
      expect(files).toContain("movie.srt");
      expect(files).toContain("movie.vtt");
      expect(files).not.toContain("other-movie.srt");
      expect(files).not.toContain("movie.mp4");
      expect(files).not.toContain("movie.jpg");
    });
  });
});

describe("Media API - Subtitle endpoint", () => {
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

    mockReadFile.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id/subtitle", () => {
    it("returns 400 when file parameter is missing", async () => {
      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle`);
      expect(res.status).toBe(400);
    });

    it("returns 400 for path traversal attempt", async () => {
      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle?file=../secret.vtt`);
      expect(res.status).toBe(400);
    });

    it("returns 400 for unsupported file extension", async () => {
      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle?file=movie.ass`);
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown media item", async () => {
      const res = await app.request("/api/v1/media/nonexistent-id/subtitle?file=movie.vtt");
      expect(res.status).toBe(404);
    });

    it("returns 404 when subtitle file does not exist on disk", async () => {
      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }) as never
      );
      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle?file=movie.vtt`);
      expect(res.status).toBe(404);
    });

    it("serves .vtt file with text/vtt content type", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello World";
      mockReadFile.mockResolvedValueOnce(Buffer.from(vttContent) as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle?file=movie.vtt`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/vtt");
      const text = await res.text();
      expect(text).toContain("WEBVTT");
      expect(text).toContain("Hello World");
    });

    it("prepends WEBVTT header to .srt files for browser compatibility", async () => {
      const srtContent = "1\n00:00:01,000 --> 00:00:04,000\nHello World\n";
      mockReadFile.mockResolvedValueOnce(Buffer.from(srtContent) as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/subtitle?file=movie.srt`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/vtt");
      const text = await res.text();
      expect(text.startsWith("WEBVTT")).toBe(true);
      expect(text).toContain("Hello World");
    });
  });
});

describe("Media API - HLS transcoding endpoints", () => {
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
      filePath: "/media/movie.mkv",
      fileName: "movie.mkv",
      fileSize: 500000,
      mimeType: "video/x-matroska",
      mediaCategory: "Movies",
      thumbnailPaths: null,
      createdAt: now,
      updatedAt: now,
    });

    mockExtractFfprobeMetadata.mockReset();
    mockNeedsTranscoding.mockReset();
    mockGenerateHlsPlaylist.mockReset();
    mockSpawnTranscodeSegment.mockReset();
    mockStat.mockReset();
    mockCreateReadStream.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("GET /api/v1/media/:id/stream — redirect for non-native formats", () => {
    it("redirects to HLS playlist when transcoding is needed", async () => {
      mockStat.mockResolvedValueOnce({ size: 500000 } as never);
      mockExtractFfprobeMetadata.mockResolvedValueOnce({
        codec: "hevc",
        audioCodec: "ac3",
      } as never);
      mockNeedsTranscoding.mockReturnValueOnce(true);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`);
      expect(res.status).toBe(307);
      expect(res.headers.get("Location")).toContain(
        `/api/v1/media/${videoItemId}/hls/playlist.m3u8`
      );
    });

    it("serves file directly when no transcoding needed", async () => {
      mockStat.mockResolvedValueOnce({ size: 500000 } as never);
      mockExtractFfprobeMetadata.mockResolvedValueOnce({
        codec: "h264",
        audioCodec: "aac",
      } as never);
      mockNeedsTranscoding.mockReturnValueOnce(false);
      const fakeStream = Readable.from(["video data"]);
      mockCreateReadStream.mockReturnValueOnce(fakeStream as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/stream`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/v1/media/:id/hls/playlist.m3u8", () => {
    it("returns 404 for unknown media item", async () => {
      const res = await app.request("/api/v1/media/nonexistent/hls/playlist.m3u8");
      expect(res.status).toBe(404);
    });

    it("returns 422 when ffprobe cannot determine duration", async () => {
      mockExtractFfprobeMetadata.mockResolvedValueOnce(null as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/hls/playlist.m3u8`);
      expect(res.status).toBe(422);
    });

    it("returns HLS playlist with correct content type", async () => {
      mockExtractFfprobeMetadata.mockResolvedValueOnce({ duration: 12 } as never);
      mockGenerateHlsPlaylist.mockReturnValueOnce(
        "#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment-0.ts\nsegment-1.ts\n#EXT-X-ENDLIST"
      );

      const res = await app.request(`/api/v1/media/${videoItemId}/hls/playlist.m3u8`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/vnd.apple.mpegurl");
      const text = await res.text();
      expect(text).toContain("#EXTM3U");
      expect(text).toContain("segment-0.ts");
    });
  });

  describe("GET /api/v1/media/:id/hls/:segment", () => {
    it("returns 400 for invalid segment name", async () => {
      const res = await app.request(`/api/v1/media/${videoItemId}/hls/invalid.mp4`);
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown media item", async () => {
      const res = await app.request("/api/v1/media/nonexistent/hls/segment-0.ts");
      expect(res.status).toBe(404);
    });

    it("returns 404 when file is not accessible on disk", async () => {
      mockStat.mockRejectedValueOnce(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }) as never
      );

      const res = await app.request(`/api/v1/media/${videoItemId}/hls/segment-0.ts`);
      expect(res.status).toBe(404);
    });

    it("returns 200 with video/mp2t content type for valid segment", async () => {
      mockStat.mockResolvedValueOnce({ size: 500000 } as never);

      const mockProc = {
        stdout: new Readable({
          read() {
            this.push("ts data");
            this.push(null);
          },
        }),
        on: vi.fn(),
        kill: vi.fn(),
      };
      mockSpawnTranscodeSegment.mockReturnValueOnce(mockProc as never);

      const res = await app.request(`/api/v1/media/${videoItemId}/hls/segment-2.ts`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp2t");
      expect(mockSpawnTranscodeSegment).toHaveBeenCalledWith("/media/movie.mkv", 2, 6);
    });
  });
});

describe("Media API - RAW image stream endpoint", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let rawItemId: string;

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

    rawItemId = crypto.randomUUID();
    await db.insert(mediaItems).values({
      id: rawItemId,
      libraryId: libId,
      dataSourceId: sourceId,
      filePath: "/media/photo.cr2",
      fileName: "photo.cr2",
      fileSize: 25000000,
      mimeType: "image/x-canon-cr2",
      mediaCategory: "Pictures",
      thumbnailPaths: null,
      createdAt: now,
      updatedAt: now,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    client.close();
  });

  it("returns converted JPEG for RAW image file", async () => {
    const jpegData = Buffer.from("fake-jpeg-data");
    mockStat.mockResolvedValueOnce({ size: 25000000 } as never);
    mockIsRawImage.mockReturnValueOnce(true);
    mockConvertRawToJpeg.mockResolvedValueOnce(jpegData);

    const res = await app.request(`/api/v1/media/${rawItemId}/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(mockConvertRawToJpeg).toHaveBeenCalledWith("/media/photo.cr2");
  });

  it("returns 500 with error message when dcraw is not installed", async () => {
    mockStat.mockResolvedValueOnce({ size: 25000000 } as never);
    mockIsRawImage.mockReturnValueOnce(true);
    mockConvertRawToJpeg.mockRejectedValueOnce(
      new Error("dcraw not found. Install dcraw to enable RAW image preview.")
    );

    const res = await app.request(`/api/v1/media/${rawItemId}/stream`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("dcraw not found");
  });

  it("skips RAW path for non-RAW files and serves directly", async () => {
    mockStat.mockResolvedValueOnce({ size: 10000 } as never);
    mockIsRawImage.mockReturnValueOnce(false);
    mockExtractFfprobeMetadata.mockResolvedValueOnce(null);
    mockNeedsTranscoding.mockReturnValue(false);
    const fakeStream = Readable.from(["jpeg data"]);
    mockCreateReadStream.mockReturnValueOnce(fakeStream as never);

    const res = await app.request(`/api/v1/media/${rawItemId}/stream`);
    expect(res.status).toBe(200);
    expect(mockConvertRawToJpeg).not.toHaveBeenCalled();
  });
});
