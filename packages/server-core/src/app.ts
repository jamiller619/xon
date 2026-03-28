import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { pluginRouteDispatcher } from "./pluginRoutes.js";
import { makeLibrariesRouter } from "./routes/libraries.js";
import { makeMediaRouter } from "./routes/media.js";

export function createApp(db?: LibSQLDatabase): Hono {
  const app = new Hono().basePath("/api/v1");

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  if (db) {
    app.route("/libraries", makeLibrariesRouter(db));
    app.route("/media", makeMediaRouter(db));
  }

  // Plugin routes: dispatched dynamically to registered plugin route handlers
  app.all("/plugins/:pluginId/*", pluginRouteDispatcher);

  return app;
}

// Default app instance (health-check only, no db) — used by existing tests
export const app = createApp();
