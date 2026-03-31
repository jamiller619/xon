import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { makeAuthMiddleware } from "./authMiddleware.js";
import { pluginRouteDispatcher } from "./pluginRoutes.js";
import { makeRateLimitMiddleware } from "./rateLimitMiddleware.js";
import { requireRole } from "./rbac.js";
import { makeAdminAiSettingsRouter } from "./routes/adminAiSettings.js";
import { makeAdminBackupRouter, makeAdminRestoreRouter } from "./routes/adminBackup.js";
import { makeAdminBackupMediaRouter } from "./routes/adminBackupMedia.js";
import { makeAdminBackupTargetsRouter } from "./routes/adminBackupTargets.js";
import { makeAdminBackupVerifyRouter } from "./routes/adminBackupVerify.js";
import { makeAdminLibraryAccessRouter } from "./routes/adminLibraryAccess.js";
import { makeAdminPluginsRouter } from "./routes/adminPlugins.js";
import { makeAdminServerSettingsRouter } from "./routes/adminServerSettings.js";
import { makeAdminUsersRouter } from "./routes/adminUsers.js";
import { makeAiRouter } from "./routes/ai.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeGroupsRouter } from "./routes/groups.js";
import { makeLibrariesRouter } from "./routes/libraries.js";
import { makeMatchingRouter } from "./routes/matching.js";
import { makeMediaRouter } from "./routes/media.js";
import { makePluginsRouter } from "./routes/plugins.js";
import { makeSearchRouter } from "./routes/search.js";
import { makeSyncRouter } from "./routes/sync.js";
import { makeThemesRouter } from "./routes/themes.js";
import { makeUsersRouter } from "./routes/users.js";
import { serverSettings } from "./schema.js";

const SERVER_SETTINGS_ID = "default";

export function createApp(db?: LibSQLDatabase): Hono {
  const app = new Hono().basePath("/api/v1");

  // CORS middleware (dynamic, reads from server settings)
  if (db) {
    app.use(
      "/*",
      cors({
        origin: async (origin) => {
          if (!origin) return null;
          const rows = await db
            .select()
            .from(serverSettings)
            .where(eq(serverSettings.id, SERVER_SETTINGS_ID));
          const settings = rows[0];
          if (!settings || !settings.corsEnabled) return null;
          const allowed = JSON.parse(settings.corsAllowedOrigins) as string[];
          if (allowed.includes("*")) return origin;
          return allowed.includes(origin) ? origin : null;
        },
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        credentials: true,
      })
    );

    // Rate limiting: auth endpoints (strict), general API
    app.use("/auth/*", makeRateLimitMiddleware(db, "auth"));
    app.use("/*", makeRateLimitMiddleware(db, "general"));
  }

  // Reverse proxy: expose X-Forwarded-Proto via a response header so clients can
  // detect whether the upstream connection was HTTPS when behind a trusted proxy.
  if (db) {
    app.use("/*", async (c, next) => {
      const rows = await db
        .select()
        .from(serverSettings)
        .where(eq(serverSettings.id, SERVER_SETTINGS_ID));
      const settings = rows[0];
      if (settings?.trustProxy) {
        const proto = c.req.header("x-forwarded-proto");
        if (proto) {
          c.header("X-Forwarded-Proto", proto);
        }
        const forwardedFor = c.req.header("x-forwarded-for");
        if (forwardedFor) {
          c.set("clientIp" as never, forwardedFor.split(",")[0]?.trim() ?? "unknown");
        }
      }
      return next();
    });
  }

  // Auth middleware on all routes (skips /api/v1/auth/* internally)
  // Passes db so API tokens can be verified alongside JWT access tokens
  app.use("/*", makeAuthMiddleware(db));

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  if (db) {
    app.route("/auth", makeAuthRouter(db));
    app.route("/libraries", makeLibrariesRouter(db));
    app.route("/groups", makeGroupsRouter(db));
    app.route("/ai", makeAiRouter(db));
    app.route("/matching", makeMatchingRouter(db));
    app.route("/media", makeMediaRouter(db));
    app.route("/search", makeSearchRouter(db));
    app.route("/users", makeUsersRouter(db));
    app.route("/sync/profiles", makeSyncRouter(db));
  }

  // Admin-only: require admin role for all /admin/* routes
  app.use("/admin/*", requireRole("admin"));

  // Admin: user management
  if (db) {
    app.route("/admin/users", makeAdminUsersRouter(db));
    app.route("/admin/libraries", makeAdminLibraryAccessRouter(db));
    app.route("/admin/ai-settings", makeAdminAiSettingsRouter(db));
    app.route("/admin/backup/metadata", makeAdminBackupRouter(db));
    app.route("/admin/restore/metadata", makeAdminRestoreRouter(db));
    app.route("/admin/backup/targets", makeAdminBackupTargetsRouter(db));
    app.route("/admin/backup/media", makeAdminBackupMediaRouter(db));
    app.route("/admin/backup/verify", makeAdminBackupVerifyRouter(db));
    app.route("/admin/server-settings", makeAdminServerSettingsRouter(db));
  }

  // Admin: plugin management
  app.route("/admin/plugins", makeAdminPluginsRouter());

  // Theme plugin listing
  app.route("/themes", makeThemesRouter());

  // Plugin UI component listing and static asset serving
  app.route("/plugins", makePluginsRouter());

  // Plugin API routes: dispatched dynamically to registered plugin route handlers
  app.all("/plugins/:pluginId/*", pluginRouteDispatcher);

  return app;
}

// Default app instance (health-check only, no db) — used by existing tests
export const app = createApp();
