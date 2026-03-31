import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { emitEvent } from "../events.js";
import type { ScanProgress, ScanSummary } from "../orchestrator.js";
import { scanLibrary } from "../orchestrator.js";
import { emitPluginEvent } from "../pluginManager.js";
import { requireRole } from "../rbac.js";
import { parseCronInterval } from "../scheduler.js";
import { libraries } from "../schema.js";
import { validate } from "../validate.js";

type ScanState = {
  status: "running" | "completed" | "failed";
  startedAt: Date;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
};

const scheduleSchema = z.object({
  scanSchedule: z
    .string()
    .nullable()
    .refine(
      (v) => v === null || parseCronInterval(v) !== null,
      "Invalid or unsupported cron expression. Supported: '*/N * * * *' or '0 */N * * *'"
    ),
});

export function makeScanRouter(db: LibSQLDatabase): Hono {
  const scanRegistry = new Map<string, ScanState>();
  const router = new Hono();

  // POST / — trigger scan (mounted at /:libraryId/scan) (manager+)
  router.post("/", requireRole("manager"), (c) => {
    const libraryId = c.req.param("libraryId") as string;

    const current = scanRegistry.get(libraryId);
    if (current?.status === "running") {
      return c.json({ status: "already_running" }, 409);
    }

    const state: ScanState = {
      status: "running",
      startedAt: new Date(),
      progress: null,
      summary: null,
      error: null,
    };
    scanRegistry.set(libraryId, state);
    emitPluginEvent("scan:start", { libraryId });

    scanLibrary(db, libraryId, (progress) => {
      state.progress = progress;
      const percentComplete =
        progress.totalFiles > 0
          ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
          : 0;
      emitEvent({
        type: "scan:progress",
        payload: {
          libraryId,
          fileCount: progress.totalFiles,
          currentFile: progress.currentFile,
          percentComplete,
        },
      });
    })
      .then((summary) => {
        state.status = "completed";
        state.summary = summary;
        emitEvent({
          type: "scan:complete",
          payload: {
            libraryId,
            newItems: summary.newItems,
            updatedItems: summary.updatedItems,
            removedItems: summary.removedItems,
            totalDiscovered: summary.totalDiscovered,
          },
        });
        emitPluginEvent("scan:complete", {
          libraryId,
          itemsFound: summary.totalDiscovered,
        });
      })
      .catch((err: unknown) => {
        state.status = "failed";
        const errorMessage = err instanceof Error ? err.message : String(err);
        state.error = errorMessage;
        emitEvent({ type: "scan:error", payload: { libraryId, error: errorMessage } });
      });

    return c.json({ status: "started" }, 202);
  });

  // GET /status — get scan status (mounted at /:libraryId/scan/status)
  router.get("/status", (c) => {
    const libraryId = c.req.param("libraryId") as string;

    const state = scanRegistry.get(libraryId);
    if (!state) {
      return c.json({ status: "idle" });
    }

    return c.json({
      status: state.status,
      startedAt: state.startedAt.toISOString(),
      progress: state.progress,
      summary: state.summary,
      error: state.error,
    });
  });

  // PUT /schedule — update scan schedule for a library (manager+)
  router.put("/schedule", requireRole("manager"), validate("json", scheduleSchema), async (c) => {
    const libraryId = c.req.param("libraryId") as string;
    const { scanSchedule } = c.req.valid("json");

    const existing = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    if (existing.length === 0) return c.json({ error: "Not found" }, 404);

    await db
      .update(libraries)
      .set({ scanSchedule, updatedAt: new Date() })
      .where(eq(libraries.id, libraryId));

    const updated = await db.select().from(libraries).where(eq(libraries.id, libraryId));
    return c.json(updated[0]);
  });

  return router;
}
