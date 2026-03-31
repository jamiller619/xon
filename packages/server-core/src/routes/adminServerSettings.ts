import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { serverSettings } from "../schema.js";

const SERVER_SETTINGS_ID = "default";

const updateSchema = z.object({
  corsEnabled: z.boolean().optional(),
  corsAllowedOrigins: z.array(z.string()).optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitGeneral: z.number().int().min(1).max(10000).optional(),
  rateLimitAuth: z.number().int().min(1).max(1000).optional(),
  httpsEnabled: z.boolean().optional(),
  httpsCertPath: z.string().nullable().optional(),
  httpsKeyPath: z.string().nullable().optional(),
  acmeEnabled: z.boolean().optional(),
  acmeDomain: z.string().nullable().optional(),
  acmeEmail: z.string().email().nullable().optional(),
  acmeCertsDir: z.string().nullable().optional(),
  trustProxy: z.boolean().optional(),
});

async function getOrInitSettings(db: LibSQLDatabase) {
  const rows = await db
    .select()
    .from(serverSettings)
    .where(eq(serverSettings.id, SERVER_SETTINGS_ID));
  if (rows.length > 0) return rows[0];
  await db.insert(serverSettings).values({ id: SERVER_SETTINGS_ID }).onConflictDoNothing();
  const fresh = await db
    .select()
    .from(serverSettings)
    .where(eq(serverSettings.id, SERVER_SETTINGS_ID));
  return fresh[0] ?? null;
}

function formatSettings(row: NonNullable<Awaited<ReturnType<typeof getOrInitSettings>>>) {
  return {
    corsEnabled: row.corsEnabled,
    corsAllowedOrigins: JSON.parse(row.corsAllowedOrigins) as string[],
    rateLimitEnabled: row.rateLimitEnabled,
    rateLimitGeneral: row.rateLimitGeneral,
    rateLimitAuth: row.rateLimitAuth,
    httpsEnabled: row.httpsEnabled,
    httpsCertPath: row.httpsCertPath ?? null,
    httpsKeyPath: row.httpsKeyPath ?? null,
    acmeEnabled: row.acmeEnabled,
    acmeDomain: row.acmeDomain ?? null,
    acmeEmail: row.acmeEmail ?? null,
    acmeCertsDir: row.acmeCertsDir ?? null,
    trustProxy: row.trustProxy,
    updatedAt: row.updatedAt,
  };
}

export function makeAdminServerSettingsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  /**
   * GET /admin/server-settings
   * Returns the current CORS, rate limit, HTTPS, and proxy configuration.
   */
  router.get("/", async (c) => {
    const row = await getOrInitSettings(db);
    if (!row) return c.json({ error: "Settings not found" }, 500);
    return c.json(formatSettings(row));
  });

  /**
   * PUT /admin/server-settings
   * Updates CORS, rate limit, HTTPS, and proxy configuration.
   */
  router.put("/", zValidator("json", updateSchema), async (c) => {
    const body = c.req.valid("json");

    const current = await getOrInitSettings(db);
    if (!current) return c.json({ error: "Settings not found" }, 500);

    const update: Partial<typeof serverSettings.$inferInsert> = { updatedAt: new Date() };

    if (body.corsEnabled !== undefined) update.corsEnabled = body.corsEnabled;
    if (body.corsAllowedOrigins !== undefined) {
      update.corsAllowedOrigins = JSON.stringify(body.corsAllowedOrigins);
    }
    if (body.rateLimitEnabled !== undefined) update.rateLimitEnabled = body.rateLimitEnabled;
    if (body.rateLimitGeneral !== undefined) update.rateLimitGeneral = body.rateLimitGeneral;
    if (body.rateLimitAuth !== undefined) update.rateLimitAuth = body.rateLimitAuth;
    if (body.httpsEnabled !== undefined) update.httpsEnabled = body.httpsEnabled;
    if (body.httpsCertPath !== undefined) {
      if (body.httpsCertPath === null) update.httpsCertPath = null;
      else update.httpsCertPath = body.httpsCertPath;
    }
    if (body.httpsKeyPath !== undefined) {
      if (body.httpsKeyPath === null) update.httpsKeyPath = null;
      else update.httpsKeyPath = body.httpsKeyPath;
    }
    if (body.acmeEnabled !== undefined) update.acmeEnabled = body.acmeEnabled;
    if (body.acmeDomain !== undefined) {
      if (body.acmeDomain === null) update.acmeDomain = null;
      else update.acmeDomain = body.acmeDomain;
    }
    if (body.acmeEmail !== undefined) {
      if (body.acmeEmail === null) update.acmeEmail = null;
      else update.acmeEmail = body.acmeEmail;
    }
    if (body.acmeCertsDir !== undefined) {
      if (body.acmeCertsDir === null) update.acmeCertsDir = null;
      else update.acmeCertsDir = body.acmeCertsDir;
    }
    if (body.trustProxy !== undefined) update.trustProxy = body.trustProxy;

    const updated = await db
      .update(serverSettings)
      .set(update)
      .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
      .returning();

    const row = updated[0];
    if (!row) return c.json({ error: "Update failed" }, 500);
    return c.json(formatSettings(row));
  });

  return router;
}
