import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { backupTargets } from "../schema.js";

// ---------------------------------------------------------------------------
// Config schemas per backup target type
// ---------------------------------------------------------------------------

export const localConfigSchema = z.object({
  destPath: z.string().min(1),
});

export const networkConfigSchema = z.object({
  mountPath: z.string().min(1),
});

export type LocalBackupConfig = z.infer<typeof localConfigSchema>;
export type NetworkBackupConfig = z.infer<typeof networkConfigSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["local", "network"]).default("local"),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["local", "network"]).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Backup copy logic
// ---------------------------------------------------------------------------

/**
 * Copy a list of source file paths to a destination directory, preserving
 * relative path structure under `basePath`.
 *
 * @param srcFiles  Array of absolute source file paths
 * @param basePath  Common root (files are placed relative to this)
 * @param destDir   Destination directory root
 */
export async function copyFilesToDestination(
  srcFiles: string[],
  basePath: string,
  destDir: string
): Promise<{ copied: number; errors: string[] }> {
  let copied = 0;
  const errors: string[] = [];

  for (const src of srcFiles) {
    try {
      // Compute relative path from basePath; fall back to basename
      const rel = src.startsWith(basePath) ? src.slice(basePath.length).replace(/^\//, "") : src;
      const dest = join(destDir, rel);
      const destParent = dest.substring(0, dest.lastIndexOf("/"));
      if (destParent) {
        await mkdir(destParent, { recursive: true });
      }
      await copyFile(src, dest);
      copied++;
    } catch (err) {
      errors.push(`${src}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { copied, errors };
}

/**
 * Perform a backup of `srcFiles` to the configured backup target.
 * Supports `local` (copies to destPath) and `network` (copies to mountPath).
 */
export async function runBackupToTarget(
  target: { type: string; config: string },
  srcFiles: string[],
  basePath: string
): Promise<{ copied: number; errors: string[] }> {
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(target.config) as Record<string, unknown>;
  } catch {
    return { copied: 0, errors: ["Invalid target config JSON"] };
  }

  if (target.type === "local") {
    const parsed = localConfigSchema.safeParse(cfg);
    if (!parsed.success) return { copied: 0, errors: ["Invalid local config: missing destPath"] };
    return copyFilesToDestination(srcFiles, basePath, parsed.data.destPath);
  }

  if (target.type === "network") {
    const parsed = networkConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      return { copied: 0, errors: ["Invalid network config: missing mountPath"] };
    }
    return copyFilesToDestination(srcFiles, basePath, parsed.data.mountPath);
  }

  return { copied: 0, errors: [`Unknown target type: ${target.type}`] };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function makeAdminBackupTargetsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  // GET /admin/backup/targets — list all targets
  router.get("/", async (c) => {
    const rows = await db.select().from(backupTargets);
    return c.json(rows);
  });

  // GET /admin/backup/targets/:id — get single target
  router.get("/:id", async (c) => {
    const id = c.req.param("id") as string;
    const rows = await db.select().from(backupTargets).where(eq(backupTargets.id, id));
    const row = rows[0];
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  // POST /admin/backup/targets — create target
  router.post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date();
    const inserted = await db
      .insert(backupTargets)
      .values({
        id,
        name: body.name,
        type: body.type,
        config: JSON.stringify(body.config),
        enabled: body.enabled,
        createdAt: now,
      })
      .returning();
    const row = inserted[0];
    if (!row) return c.json({ error: "Insert failed" }, 500);
    return c.json(row, 201);
  });

  // PUT /admin/backup/targets/:id — update target
  router.put("/:id", zValidator("json", updateSchema), async (c) => {
    const id = c.req.param("id") as string;
    const body = c.req.valid("json");

    const existing = await db.select().from(backupTargets).where(eq(backupTargets.id, id));
    if (!existing[0]) return c.json({ error: "Not found" }, 404);

    const update: Partial<typeof backupTargets.$inferInsert> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.type !== undefined) update.type = body.type;
    if (body.config !== undefined) update.config = JSON.stringify(body.config);
    if (body.enabled !== undefined) update.enabled = body.enabled;

    const updated = await db
      .update(backupTargets)
      .set(update)
      .where(eq(backupTargets.id, id))
      .returning();
    const row = updated[0];
    if (!row) return c.json({ error: "Update failed" }, 500);
    return c.json(row);
  });

  // DELETE /admin/backup/targets/:id — delete target
  router.delete("/:id", async (c) => {
    const id = c.req.param("id") as string;
    const existing = await db.select().from(backupTargets).where(eq(backupTargets.id, id));
    if (!existing[0]) return c.json({ error: "Not found" }, 404);

    await db.delete(backupTargets).where(eq(backupTargets.id, id));
    return c.json({ success: true });
  });

  return router;
}
