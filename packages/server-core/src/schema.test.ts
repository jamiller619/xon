import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { migrateDatabase } from "./migrate.js";
import { dataSources, libraries } from "./schema.js";

describe("schema", () => {
  let client: Client;
  let db: LibSQLDatabase;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
  });

  afterEach(() => {
    client.close();
  });

  describe("libraries table", () => {
    it("inserts and retrieves a library", async () => {
      await db.insert(libraries).values({
        id: "lib-1",
        name: "My Movies",
        description: "Movie collection",
        allowedMediaTypes: '["Movies"]',
      });

      const rows = await db.select().from(libraries);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("lib-1");
      expect(rows[0]?.name).toBe("My Movies");
      expect(rows[0]?.description).toBe("Movie collection");
      expect(rows[0]?.allowedMediaTypes).toBe('["Movies"]');
    });

    it("uses empty array as default for allowedMediaTypes", async () => {
      await db.insert(libraries).values({ id: "lib-2", name: "Empty Library" });

      const rows = await db.select().from(libraries);
      expect(rows[0]?.allowedMediaTypes).toBe("[]");
    });

    it("populates createdAt and updatedAt with defaults", async () => {
      await db.insert(libraries).values({ id: "lib-3", name: "Timestamped" });

      const rows = await db.select().from(libraries);
      const row = rows[0];
      expect(row?.createdAt).toBeInstanceOf(Date);
      expect(row?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("data_sources table", () => {
    beforeEach(async () => {
      await db.insert(libraries).values({ id: "lib-1", name: "Test Library" });
    });

    it("inserts and retrieves a data source", async () => {
      await db.insert(dataSources).values({
        id: "ds-1",
        libraryId: "lib-1",
        type: "local",
        path: "/media/movies",
        recursive: true,
        enabled: true,
      });

      const rows = await db.select().from(dataSources);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("ds-1");
      expect(rows[0]?.libraryId).toBe("lib-1");
      expect(rows[0]?.type).toBe("local");
      expect(rows[0]?.path).toBe("/media/movies");
      expect(rows[0]?.recursive).toBe(true);
      expect(rows[0]?.enabled).toBe(true);
    });

    it("supports network type data sources", async () => {
      await db.insert(dataSources).values({
        id: "ds-2",
        libraryId: "lib-1",
        type: "network",
        path: "smb://server/share",
      });

      const rows = await db.select().from(dataSources);
      expect(rows[0]?.type).toBe("network");
    });

    it("cascades delete to data sources when library is deleted", async () => {
      await db.insert(dataSources).values({
        id: "ds-1",
        libraryId: "lib-1",
        type: "local",
        path: "/media",
      });

      await db.delete(libraries).where(eq(libraries.id, "lib-1"));
      const dsRows = await db.select().from(dataSources);
      expect(dsRows).toHaveLength(0);
    });
  });
});
