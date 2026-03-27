import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { openDatabase } from "../db.js";
import { migrateDatabase } from "../migrate.js";

vi.mock("../orchestrator.js", () => ({
  scanLibrary: vi.fn(),
}));

const { scanLibrary } = await import("../orchestrator.js");
const mockScanLibrary = vi.mocked(scanLibrary);

describe("Scan API", () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let libraryId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);
    app = createApp(db);

    // Create a library for scan tests
    const res = await app.request("/api/v1/libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Scan Test Library" }),
    });
    const body = await res.json();
    libraryId = body.id;

    mockScanLibrary.mockReset();
  });

  afterEach(() => {
    client.close();
  });

  describe("POST /api/v1/libraries/:id/scan", () => {
    it("returns 202 with status started when scan begins", async () => {
      mockScanLibrary.mockReturnValue(new Promise(() => {}));

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan`, {
        method: "POST",
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("returns 409 with already_running if scan is in progress", async () => {
      mockScanLibrary.mockReturnValue(new Promise(() => {}));

      await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.status).toBe("already_running");
    });

    it("allows re-triggering after a completed scan", async () => {
      const summary = {
        libraryId,
        newItems: 0,
        updatedItems: 0,
        removedItems: 0,
        totalDiscovered: 0,
      };
      mockScanLibrary.mockResolvedValue(summary);

      await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });
      // Wait for the promise chain to settle
      await Promise.resolve();
      await Promise.resolve();

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.status).toBe("started");
    });
  });

  describe("GET /api/v1/libraries/:id/scan/status", () => {
    it("returns idle when no scan has been triggered", async () => {
      const res = await app.request(`/api/v1/libraries/${libraryId}/scan/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("idle");
    });

    it("returns running status while scan is in progress", async () => {
      mockScanLibrary.mockReturnValue(new Promise(() => {}));

      await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("running");
      expect(body.startedAt).toBeDefined();
      expect(body.progress).toBeNull();
      expect(body.summary).toBeNull();
      expect(body.error).toBeNull();
    });

    it("returns completed status with summary after scan finishes", async () => {
      const summary = {
        libraryId,
        newItems: 3,
        updatedItems: 1,
        removedItems: 0,
        totalDiscovered: 4,
      };
      mockScanLibrary.mockResolvedValue(summary);

      await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });
      // Flush promise microtasks
      await Promise.resolve();
      await Promise.resolve();

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("completed");
      expect(body.summary).toMatchObject(summary);
    });

    it("returns failed status with error message when scan throws", async () => {
      mockScanLibrary.mockRejectedValue(new Error("Library not found: bad-id"));

      await app.request(`/api/v1/libraries/${libraryId}/scan`, { method: "POST" });
      await Promise.resolve();
      await Promise.resolve();

      const res = await app.request(`/api/v1/libraries/${libraryId}/scan/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("failed");
      expect(body.error).toBe("Library not found: bad-id");
    });
  });
});
