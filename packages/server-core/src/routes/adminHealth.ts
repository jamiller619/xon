import { statfs } from "node:fs/promises";
import { freemem, loadavg, totalmem } from "node:os";
import { eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { scanRegistry } from "../scanRegistry.js";
import { libraries, mediaItems } from "../schema.js";

export function makeAdminHealthRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  /**
   * GET /admin/health
   * Returns system health info: uptime, memory, CPU load, storage, active scans,
   * and per-library statistics.
   */
  router.get("/", async (c) => {
    const uptimeSeconds = process.uptime();

    // Memory
    const mem = process.memoryUsage();
    const totalRam = totalmem();
    const freeRam = freemem();

    // CPU load averages (1m, 5m, 15m)
    const loads = loadavg();
    const load1m = loads[0] ?? 0;
    const load5m = loads[1] ?? 0;
    const load15m = loads[2] ?? 0;

    // Disk stats for the data directory
    let diskTotal = 0;
    let diskFree = 0;
    const dataDir = process.env.DATA_DIR ?? "./data";
    try {
      const stats = await statfs(dataDir);
      diskTotal = stats.bsize * stats.blocks;
      diskFree = stats.bsize * stats.bfree;
    } catch {
      // Directory may not exist yet; report zeros
    }

    // Active scans from shared registry
    const activeScans = [...scanRegistry.entries()]
      .filter(([, s]) => s.status === "running")
      .map(([libraryId, s]) => ({
        libraryId,
        startedAt: s.startedAt.toISOString(),
        progress: s.progress,
      }));

    // Library statistics: item count and last scan time per library
    const libRows = await db.select().from(libraries);

    const libraryStats = await Promise.all(
      libRows.map(async (lib) => {
        const rows = await db
          .select({
            total: sql<number>`count(*)`,
            lastScan: sql<number | null>`max(${mediaItems.scannedAt})`,
          })
          .from(mediaItems)
          .where(eq(mediaItems.libraryId, lib.id));
        const row = rows[0];
        const total = row?.total ?? 0;
        const lastScanRaw = row?.lastScan ?? null;
        // scannedAt is stored as unix seconds by drizzle integer(timestamp)
        const lastScanAt = lastScanRaw !== null ? new Date(lastScanRaw * 1000).toISOString() : null;
        return {
          id: lib.id,
          name: lib.name,
          totalItems: total,
          lastScanAt,
        };
      })
    );

    return c.json({
      uptime: uptimeSeconds,
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        total: totalRam,
        free: freeRam,
      },
      cpu: {
        loadAvg1m: load1m,
        loadAvg5m: load5m,
        loadAvg15m: load15m,
      },
      storage: {
        total: diskTotal,
        free: diskFree,
        used: diskTotal - diskFree,
      },
      activeScans,
      libraries: libraryStats,
    });
  });

  return router;
}
