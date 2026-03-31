import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../crypto.js";
import { aiSettings } from "../schema.js";
import { validate } from "../validate.js";

const AI_SETTINGS_ID = "default";

const updateSchema = z.object({
  aiEnabled: z.boolean().optional(),
  aiMode: z.enum(["local-only", "cloud-only", "local-with-cloud-fallback"]).optional(),
  /** Pass null to clear, omit to keep, pass a non-"***" string to update */
  cloudApiKey: z.string().nullable().optional(),
  cloudApiUrl: z.string().nullable().optional(),
  featureMatching: z.boolean().optional(),
  featureTagging: z.boolean().optional(),
  featureSimilarity: z.boolean().optional(),
  featureSmartGrouping: z.boolean().optional(),
});

/** Load or initialise the singleton settings row */
async function getOrInitSettings(db: LibSQLDatabase) {
  const rows = await db.select().from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_ID));
  if (rows.length > 0) return rows[0];
  // Insert the default row if it doesn't exist
  await db.insert(aiSettings).values({ id: AI_SETTINGS_ID }).onConflictDoNothing();
  const fresh = await db.select().from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_ID));
  return fresh[0] ?? null;
}

/** Returns settings with the cloud API key masked */
function maskSettings(row: NonNullable<Awaited<ReturnType<typeof getOrInitSettings>>>) {
  return {
    aiEnabled: row.aiEnabled,
    aiMode: row.aiMode,
    cloudApiKeySet: row.cloudApiKey !== null && row.cloudApiKey !== "",
    cloudApiUrl: row.cloudApiUrl,
    featureMatching: row.featureMatching,
    featureTagging: row.featureTagging,
    featureSimilarity: row.featureSimilarity,
    featureSmartGrouping: row.featureSmartGrouping,
    updatedAt: row.updatedAt,
  };
}

export function makeAdminAiSettingsRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  /**
   * GET /admin/ai-settings
   * Returns the current AI configuration. Cloud API key is never returned in plaintext.
   */
  router.get("/", async (c) => {
    const row = await getOrInitSettings(db);
    if (!row) return c.json({ error: "Settings not found" }, 500);
    return c.json(maskSettings(row));
  });

  /**
   * PUT /admin/ai-settings
   * Updates AI configuration. Pass cloudApiKey to update the key; omit to leave unchanged.
   * The API key is encrypted at rest using AES-256-GCM.
   */
  router.put("/", validate("json", updateSchema), async (c) => {
    const body = c.req.valid("json");

    const current = await getOrInitSettings(db);
    if (!current) return c.json({ error: "Settings not found" }, 500);

    const update: Partial<typeof aiSettings.$inferInsert> = { updatedAt: new Date() };

    if (body.aiEnabled !== undefined) update.aiEnabled = body.aiEnabled;
    if (body.aiMode !== undefined) update.aiMode = body.aiMode;
    if (body.featureMatching !== undefined) update.featureMatching = body.featureMatching;
    if (body.featureTagging !== undefined) update.featureTagging = body.featureTagging;
    if (body.featureSimilarity !== undefined) update.featureSimilarity = body.featureSimilarity;
    if (body.featureSmartGrouping !== undefined)
      update.featureSmartGrouping = body.featureSmartGrouping;
    if (body.cloudApiUrl !== undefined) update.cloudApiUrl = body.cloudApiUrl;

    // Cloud API key: only update when explicitly provided and not the masked placeholder
    if (body.cloudApiKey !== undefined) {
      if (body.cloudApiKey === null || body.cloudApiKey === "") {
        update.cloudApiKey = null;
      } else {
        update.cloudApiKey = encryptSecret(body.cloudApiKey);
      }
    }

    const updated = await db
      .update(aiSettings)
      .set(update)
      .where(eq(aiSettings.id, AI_SETTINGS_ID))
      .returning();

    const row = updated[0];
    if (!row) return c.json({ error: "Update failed" }, 500);
    return c.json(maskSettings(row));
  });

  /**
   * GET /admin/ai-settings/key
   * Returns the decrypted cloud API key for server-internal use.
   * Only accessible to admin role (enforced by parent /admin/* middleware).
   */
  router.get("/key", async (c) => {
    const row = await getOrInitSettings(db);
    if (!row || !row.cloudApiKey) return c.json({ cloudApiKey: null });
    try {
      const decrypted = decryptSecret(row.cloudApiKey);
      return c.json({ cloudApiKey: decrypted });
    } catch {
      return c.json({ error: "Failed to decrypt API key" }, 500);
    }
  });

  return router;
}
