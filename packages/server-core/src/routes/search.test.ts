import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";
import { dataSources, libraries, libraryAccess, mediaItems, users } from "../schema.js";
import { signAccessToken } from "./auth.js";

const ADMIN_AUTH = `Bearer ${await signAccessToken("admin-id", "admin", "admin")}`;
const USER_AUTH = `Bearer ${await signAccessToken("user-id", "regularuser", "user")}`;

describe("Search API - GET /api/v1/search", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    // Create libraries
    await db.insert(libraries).values([
      { id: "lib-1", name: "Movies", allowedMediaTypes: "[]" },
      { id: "lib-2", name: "Music", allowedMediaTypes: "[]" },
    ]);

    // Create data sources
    await db.insert(dataSources).values([
      { id: "ds-1", libraryId: "lib-1", type: "local", path: "/movies" },
      { id: "ds-2", libraryId: "lib-2", type: "local", path: "/music" },
    ]);

    // Create users
    await db.insert(users).values([
      {
        id: "admin-id",
        username: "admin",
        email: "admin@example.com",
        displayName: "Admin",
        passwordHash: "hash",
        role: "admin",
      },
      {
        id: "user-id",
        username: "regularuser",
        email: "user@example.com",
        displayName: "Regular User",
        passwordHash: "hash",
        role: "user",
      },
    ]);

    // Create media items
    await db.insert(mediaItems).values([
      {
        id: "item-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/movies/inception.mkv",
        fileName: "inception.mkv",
        fileSize: 5000,
        title: "Inception",
        description: "A mind-bending thriller about dreams",
        mediaCategory: "Movies",
        metadata: "{}",
      },
      {
        id: "item-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/movies/interstellar.mkv",
        fileName: "interstellar.mkv",
        fileSize: 6000,
        title: "Interstellar",
        description: "A journey through space and wormholes",
        mediaCategory: "Movies",
        metadata: "{}",
      },
      {
        id: "item-3",
        libraryId: "lib-2",
        dataSourceId: "ds-2",
        filePath: "/music/dark-side.flac",
        fileName: "dark-side.flac",
        fileSize: 3000,
        title: "Dark Side of the Moon",
        description: "Progressive rock album",
        mediaCategory: "Music",
        metadata: "{}",
      },
    ]);

    // Grant regular user access to lib-1 only
    await db.insert(libraryAccess).values({
      userId: "user-id",
      libraryId: "lib-1",
      grantedBy: "admin-id",
    });
  });

  afterEach(() => {
    client.close();
  });

  it("returns 400 when q param is missing", async () => {
    const res = await app.request("/api/v1/search", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns search results matching title", async () => {
    const res = await app.request("/api/v1/search?q=Inception", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe("item-1");
    expect(body.results[0].title).toBe("Inception");
  });

  it("returns results with thumbnailUrls null when no thumbnail", async () => {
    const res = await app.request("/api/v1/search?q=Inception", {
      headers: { Authorization: ADMIN_AUTH },
    });
    const body = await res.json();
    expect(body.results[0].thumbnailUrls).toBeNull();
  });

  it("returns results with thumbnailUrls when thumbnail exists", async () => {
    await db
      .update(mediaItems)
      .set({ thumbnailPaths: JSON.stringify({ small: "/thumbs/item-1-sm.jpg" }) })
      .where(eq(mediaItems.id, "item-1"));

    const res = await app.request("/api/v1/search?q=Inception", {
      headers: { Authorization: ADMIN_AUTH },
    });
    const body = await res.json();
    expect(body.results[0].thumbnailUrls).toEqual({
      small: "/api/v1/media/item-1/thumbnail?size=small",
      medium: "/api/v1/media/item-1/thumbnail?size=medium",
      large: "/api/v1/media/item-1/thumbnail?size=large",
    });
  });

  it("returns results matching description", async () => {
    const res = await app.request("/api/v1/search?q=wormholes", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.some((r: { id: string }) => r.id === "item-2")).toBe(true);
  });

  it("filters results by category", async () => {
    const res = await app.request("/api/v1/search?q=Dark+Side&category=Music", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe("item-3");
  });

  it("returns empty results for category with no matches", async () => {
    const res = await app.request("/api/v1/search?q=Inception&category=Music", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(0);
  });

  it("scopes results to accessible libraries for regular users", async () => {
    // Regular user has access to lib-1 only (not lib-2)
    const res = await app.request("/api/v1/search?q=Dark+Side", {
      headers: { Authorization: USER_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // item-3 is in lib-2 which user has no access to
    expect(body.results.some((r: { id: string }) => r.id === "item-3")).toBe(false);
  });

  it("admin can see all results across libraries", async () => {
    const res = await app.request("/api/v1/search?q=side", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // "dark-side.flac" filename and "Dark Side of the Moon" title both match "side"
    expect(body.results.some((r: { id: string }) => r.id === "item-3")).toBe(true);
  });

  it("returns empty results when user has no library access", async () => {
    // Create a user with no library access at all
    await db.insert(users).values({
      id: "no-access-id",
      username: "noaccess",
      email: "noaccess@example.com",
      displayName: "No Access",
      passwordHash: "hash",
      role: "user",
    });
    const noAccessAuth = `Bearer ${await signAccessToken("no-access-id", "noaccess", "user")}`;

    const res = await app.request("/api/v1/search?q=Inception", {
      headers: { Authorization: noAccessAuth },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(0);
  });

  it("respects limit and offset pagination", async () => {
    const res = await app.request("/api/v1/search?q=the&limit=1&offset=0", {
      headers: { Authorization: ADMIN_AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
  });
});
