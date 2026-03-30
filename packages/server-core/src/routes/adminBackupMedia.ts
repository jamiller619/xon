import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { emitEvent } from "../events.js";
import { backupJobs, backupTargets, mediaItems } from "../schema.js";
import { localConfigSchema, networkConfigSchema } from "./adminBackupTargets.js";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const startBackupSchema = z.object({
  targetId: z.string().min(1),
  scope: z
    .object({
      all: z.boolean().optional(),
      libraryIds: z.array(z.string()).optional(),
      mediaTypes: z.array(z.string()).optional(),
      itemIds: z.array(z.string()).optional(),
    })
    .default({}),
});

// ---------------------------------------------------------------------------
// Backup execution
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

export async function runMediaBackupJob(db: LibSQLDatabase, jobId: string): Promise<void> {
  const now = new Date();

  // Mark job as running
  await db
    .update(backupJobs)
    .set({ status: "running", startedAt: now })
    .where(eq(backupJobs.id, jobId));

  // Load job record
  const jobRows = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId));
  const job = jobRows[0];
  if (!job) {
    emitEvent({ type: "backup:media:error", payload: { jobId, error: "Job not found" } });
    return;
  }

  // Load target
  const targetRows = await db
    .select()
    .from(backupTargets)
    .where(eq(backupTargets.id, job.targetId));
  const target = targetRows[0];
  if (!target) {
    await db
      .update(backupJobs)
      .set({
        status: "failed",
        errors: JSON.stringify(["Backup target not found"]),
        completedAt: new Date(),
      })
      .where(eq(backupJobs.id, jobId));
    emitEvent({
      type: "backup:media:error",
      payload: { jobId, error: "Backup target not found" },
    });
    return;
  }

  const destDir = await resolveDestDir(target);
  if (!destDir) {
    await db
      .update(backupJobs)
      .set({
        status: "failed",
        errors: JSON.stringify(["Invalid target configuration"]),
        completedAt: new Date(),
      })
      .where(eq(backupJobs.id, jobId));
    emitEvent({
      type: "backup:media:error",
      payload: { jobId, error: "Invalid target configuration" },
    });
    return;
  }

  // Parse scope and query media items
  let scope: {
    all?: boolean;
    libraryIds?: string[];
    mediaTypes?: string[];
    itemIds?: string[];
  };
  try {
    scope = JSON.parse(job.scope) as typeof scope;
  } catch {
    scope = {};
  }

  // Build query filters
  const filters = [];
  if (scope.libraryIds && scope.libraryIds.length > 0) {
    filters.push(inArray(mediaItems.libraryId, scope.libraryIds));
  }
  if (scope.mediaTypes && scope.mediaTypes.length > 0) {
    filters.push(inArray(mediaItems.mediaCategory, scope.mediaTypes));
  }
  if (scope.itemIds && scope.itemIds.length > 0) {
    filters.push(inArray(mediaItems.id, scope.itemIds));
  }

  const items =
    filters.length > 0
      ? await db
          .select({ id: mediaItems.id, filePath: mediaItems.filePath })
          .from(mediaItems)
          .where(and(...filters))
      : await db.select({ id: mediaItems.id, filePath: mediaItems.filePath }).from(mediaItems);

  const total = items.length;

  // Update total count
  await db.update(backupJobs).set({ totalFiles: total }).where(eq(backupJobs.id, jobId));

  let copied = 0;
  const errors: string[] = [];

  for (const item of items) {
    emitEvent({
      type: "backup:media:progress",
      payload: { jobId, copied, total, currentFile: item.filePath },
    });

    try {
      const dest = join(destDir, item.filePath.replace(/^\//, ""));
      const destParent = dest.substring(0, dest.lastIndexOf("/"));
      if (destParent) {
        await mkdir(destParent, { recursive: true });
      }
      await copyFile(item.filePath, dest);
      copied++;
      await db.update(backupJobs).set({ copiedFiles: copied }).where(eq(backupJobs.id, jobId));
    } catch (err) {
      errors.push(`${item.filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const finalStatus = errors.length > 0 && copied === 0 ? "failed" : "completed";
  await db
    .update(backupJobs)
    .set({
      status: finalStatus,
      copiedFiles: copied,
      errors: JSON.stringify(errors),
      completedAt: new Date(),
    })
    .where(eq(backupJobs.id, jobId));

  emitEvent({
    type: "backup:media:complete",
    payload: { jobId, copied, errors: errors.length },
  });
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function makeAdminBackupMediaRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // POST /admin/backup/media — start a media backup job
  router.post("/", zValidator("json", startBackupSchema), async (c) => {
    const body = c.req.valid("json");

    // Verify target exists and is enabled
    const targetRows = await db
      .select()
      .from(backupTargets)
      .where(eq(backupTargets.id, body.targetId));
    const target = targetRows[0];
    if (!target) {
      return c.json({ error: "Backup target not found" }, 404);
    }
    if (!target.enabled) {
      return c.json({ error: "Backup target is disabled" }, 400);
    }

    const jobId = crypto.randomUUID();
    const now = new Date();
    await db.insert(backupJobs).values({
      id: jobId,
      targetId: body.targetId,
      scope: JSON.stringify(body.scope),
      status: "pending",
      totalFiles: 0,
      copiedFiles: 0,
      errors: "[]",
      createdAt: now,
    });

    // Run backup asynchronously (fire-and-forget)
    runMediaBackupJob(db, jobId).catch(() => {
      // errors are stored in the job record
    });

    return c.json({ jobId, status: "running" }, 202);
  });

  // GET /admin/backup/media/jobs — list all backup jobs
  router.get("/jobs", async (c) => {
    const rows = await db.select().from(backupJobs).orderBy(desc(backupJobs.createdAt));
    return c.json(rows);
  });

  // GET /admin/backup/media/jobs/:id — get single job
  router.get("/jobs/:id", async (c) => {
    const id = c.req.param("id") as string;
    const rows = await db.select().from(backupJobs).where(eq(backupJobs.id, id));
    const row = rows[0];
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  return router;
}
