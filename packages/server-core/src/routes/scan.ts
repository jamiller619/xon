import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { emitEvent } from "../events.js";
import type { ScanProgress, ScanSummary } from "../orchestrator.js";
import { scanLibrary } from "../orchestrator.js";

type ScanState = {
  status: "running" | "completed" | "failed";
  startedAt: Date;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
};

export function makeScanRouter(db: LibSQLDatabase): Hono {
  const scanRegistry = new Map<string, ScanState>();
  const router = new Hono();

  // POST / — trigger scan (mounted at /:libraryId/scan)
  router.post("/", (c) => {
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

  return router;
}
