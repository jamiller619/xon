import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { authMiddleware } from "./authMiddleware.js";
import { pluginRouteDispatcher } from "./pluginRoutes.js";
import { makeAdminPluginsRouter } from "./routes/adminPlugins.js";
import { makeAdminUsersRouter } from "./routes/adminUsers.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeLibrariesRouter } from "./routes/libraries.js";
import { makeMediaRouter } from "./routes/media.js";
import { makePluginsRouter } from "./routes/plugins.js";
import { makeThemesRouter } from "./routes/themes.js";

export function createApp(db?: LibSQLDatabase): Hono {
  const app = new Hono().basePath("/api/v1");

  // Auth middleware on all routes (skips /api/v1/auth/* internally)
  app.use("/*", authMiddleware);

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  if (db) {
    app.route("/auth", makeAuthRouter(db));
    app.route("/libraries", makeLibrariesRouter(db));
    app.route("/media", makeMediaRouter(db));
  }

  // Admin: user management
  if (db) {
    app.route("/admin/users", makeAdminUsersRouter(db));
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
