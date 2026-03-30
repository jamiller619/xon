import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { emitEvent } from "../events.js";
import { backupFileState, backupTargets, backupVerifyJobs } from "../schema.js";
import { localConfigSchema, networkConfigSchema } from "./adminBackupTargets.js";

// ---------------------------------------------------------------------------
// Checksum helper
// ---------------------------------------------------------------------------

export async function computeChecksum(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Dest dir resolver (same logic as adminBackupMedia)
// ---------------------------------------------------------------------------

async function resolveDestDir(target: { type: string; config: string }): Promise<string | null> {
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(target.config) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (target.type === "local") {
    const parsed = localConfigSchema.safeParse(cfg);
    return parsed.success ? parsed.data.destPath : null;
  }
  if (target.type === "network") {
    const parsed = networkConfigSchema.safeParse(cfg);
    return parsed.success ? parsed.data.mountPath : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verify job execution
// ---------------------------------------------------------------------------

export async function runVerifyJob(db: LibSQLDatabase, jobId: string): Promise<void> {
  const now = new Date();

  await db
    .update(backupVerifyJobs)
    .set({ status: "running", startedAt: now })
    .where(eq(backupVerifyJobs.id, jobId));

  const jobRows = await db.select().from(backupVerifyJobs).where(eq(backupVerifyJobs.id, jobId));
  const job = jobRows[0];
  if (!job) {
    emitEvent({ type: "backup:verify:error", payload: { jobId, error: "Verify job not found" } });
    return;
  }

  const targetRows = await db
    .select()
    .from(backupTargets)
    .where(eq(backupTargets.id, job.targetId));
  const target = targetRows[0];
  if (!target) {
    await db
      .update(backupVerifyJobs)
      .set({
        status: "failed",
        failedItems: JSON.stringify([{ filePath: "", reason: "Backup target not found" }]),
        completedAt: new Date(),
      })
      .where(eq(backupVerifyJobs.id, jobId));
    emitEvent({
      type: "backup:verify:error",
      payload: { jobId, error: "Backup target not found" },
    });
    return;
  }

  const destDir = await resolveDestDir(target);
  if (!destDir) {
    await db
      .update(backupVerifyJobs)
      .set({
        status: "failed",
        failedItems: JSON.stringify([{ filePath: "", reason: "Invalid target configuration" }]),
        completedAt: new Date(),
      })
      .where(eq(backupVerifyJobs.id, jobId));
    emitEvent({
      type: "backup:verify:error",
      payload: { jobId, error: "Invalid target configuration" },
    });
    return;
  }

  // Load all backed-up files for this target
  const stateRows = await db
    .select()
    .from(backupFileState)
    .where(eq(backupFileState.targetId, job.targetId));

  const total = stateRows.length;
  await db
    .update(backupVerifyJobs)
    .set({ totalFiles: total })
    .where(eq(backupVerifyJobs.id, jobId));

  let passed = 0;
  let failed = 0;
  let missing = 0;
  const failedItems: { filePath: string; reason: string }[] = [];

  for (const row of stateRows) {
    emitEvent({
      type: "backup:verify:progress",
      payload: { jobId, checked: passed + failed + missing, total, currentFile: row.filePath },
    });

    const destPath = join(destDir, row.filePath.replace(/^\//, ""));

    // Compute source checksum
    let srcChecksum: string | null = null;
    try {
      srcChecksum = await computeChecksum(row.filePath);
    } catch {
      // Source file missing or unreadable
    }

    // Compute destination checksum
    let destChecksum: string | null = null;
    try {
      destChecksum = await computeChecksum(destPath);
    } catch {
      // Destination file missing or unreadable
    }

    if (srcChecksum === null || destChecksum === null) {
      const reason =
        srcChecksum === null && destChecksum === null
          ? "Source and destination files missing"
          : srcChecksum === null
            ? "Source file missing"
            : "Destination file missing";
      missing++;
      failedItems.push({ filePath: row.filePath, reason });

      // Flag for re-backup: reset mtime+size so incremental backup re-copies the file
      await db
        .update(backupFileState)
        .set({ mtime: 0, fileSize: 0, checksum: null })
        .where(eq(backupFileState.id, row.id));
    } else if (srcChecksum !== destChecksum) {
      failed++;
      failedItems.push({ filePath: row.filePath, reason: "Checksum mismatch" });

      // Flag for re-backup
      await db
        .update(backupFileState)
        .set({ mtime: 0, fileSize: 0, checksum: null })
        .where(eq(backupFileState.id, row.id));
    } else {
      passed++;
      // Store verified checksum in state
      await db
        .update(backupFileState)
        .set({ checksum: srcChecksum })
        .where(eq(backupFileState.id, row.id));
    }

    await db
      .update(backupVerifyJobs)
      .set({ passedFiles: passed, failedFiles: failed, missingFiles: missing })
      .where(eq(backupVerifyJobs.id, jobId));
  }

  const finalStatus = total === 0 || (failed === 0 && missing === 0) ? "completed" : "completed";
  await db
    .update(backupVerifyJobs)
    .set({
      status: finalStatus,
      passedFiles: passed,
      failedFiles: failed,
      missingFiles: missing,
      failedItems: JSON.stringify(failedItems),
      completedAt: new Date(),
    })
    .where(eq(backupVerifyJobs.id, jobId));

  emitEvent({
    type: "backup:verify:complete",
    payload: { jobId, passed, failed, missing },
  });
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function makeAdminBackupVerifyRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /admin/backup/verify/:targetId — start an integrity check
  router.post("/:targetId", async (c) => {
    const targetId = c.req.param("targetId") as string;

    const targetRows = await db.select().from(backupTargets).where(eq(backupTargets.id, targetId));
    const target = targetRows[0];
    if (!target) {
      return c.json({ error: "Backup target not found" }, 404);
    }
    if (!target.enabled) {
      return c.json({ error: "Backup target is disabled" }, 400);
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    await db.insert(backupVerifyJobs).values({
      id: jobId,
      targetId,
      status: "pending",
      totalFiles: 0,
      passedFiles: 0,
      failedFiles: 0,
      missingFiles: 0,
      failedItems: "[]",
      createdAt: now,
    });

    // Run verify asynchronously (fire-and-forget)
    runVerifyJob(db, jobId).catch(() => {
      // errors are stored in the job record
    });

    return c.json({ jobId, status: "running" }, 202);
  });

  // GET /admin/backup/verify/jobs — list all verify jobs
  router.get("/jobs", async (c) => {
    const rows = await db.select().from(backupVerifyJobs).orderBy(desc(backupVerifyJobs.createdAt));
    return c.json(rows);
  });

  // GET /admin/backup/verify/jobs/:id — get single verify job
  router.get("/jobs/:id", async (c) => {
    const id = c.req.param("id") as string;
    const rows = await db.select().from(backupVerifyJobs).where(eq(backupVerifyJobs.id, id));
    const row = rows[0];
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  return router;
}
