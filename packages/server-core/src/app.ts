import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { makeAuthMiddleware } from "./authMiddleware.js";
import { pluginRouteDispatcher } from "./pluginRoutes.js";
import { requireRole } from "./rbac.js";
import { makeAdminAiSettingsRouter } from "./routes/adminAiSettings.js";
import { makeAdminBackupRouter, makeAdminRestoreRouter } from "./routes/adminBackup.js";
import { makeAdminBackupTargetsRouter } from "./routes/adminBackupTargets.js";
import { makeAdminLibraryAccessRouter } from "./routes/adminLibraryAccess.js";
import { makeAdminPluginsRouter } from "./routes/adminPlugins.js";
import { makeAdminUsersRouter } from "./routes/adminUsers.js";
import { makeAiRouter } from "./routes/ai.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeGroupsRouter } from "./routes/groups.js";
import { makeLibrariesRouter } from "./routes/libraries.js";
import { makeMatchingRouter } from "./routes/matching.js";
import { makeMediaRouter } from "./routes/media.js";
import { makePluginsRouter } from "./routes/plugins.js";
import { makeSearchRouter } from "./routes/search.js";
import { makeThemesRouter } from "./routes/themes.js";
import { makeUsersRouter } from "./routes/users.js";

export function createApp(db?: LibSQLDatabase): Hono {
  const app = new Hono().basePath("/api/v1");

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
