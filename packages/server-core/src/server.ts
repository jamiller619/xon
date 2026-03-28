import { serve } from "@hono/node-server";
import { DEFAULT_PORT } from "@xon/shared";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { migrateDatabase } from "./migrate.js";
import { emitPluginEvent } from "./pluginManager.js";
import { WS_PATH, createWsServer } from "./routes/ws.js";
import { startScheduler } from "./scheduler.js";
import { makeStaticMiddleware } from "./staticFiles.js";

export function boot(): void {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const webClientDir = process.env.WEB_CLIENT_DIR;
  const webSsrBundle = process.env.WEB_SSR_BUNDLE;

  openDatabase()
    .then(async ({ client, db }) => {
      await migrateDatabase(db);
      const apiApp = createApp(db);
      const app = new Hono();
      app.route("/", apiApp);
      if (webClientDir) {
        app.use("/*", makeStaticMiddleware(webClientDir, webSsrBundle));
      }
      const { handleUpgrade } = createWsServer();
      const scheduler = await startScheduler(db);
      const server = serve({ fetch: app.fetch, port }, (info) => {
        console.log(`Xon server listening on port ${info.port}`);
        emitPluginEvent("server:boot", {});
      });

      server.on("upgrade", (req, socket, head) => {
        if (req.url === WS_PATH) {
          handleUpgrade(req, socket, head);
        } else {
          socket.destroy();
        }
      });

      function shutdown(): void {
        emitPluginEvent("server:shutdown", {});
        scheduler.stop();
        server.close(() => {
          client.close();
          process.exit(0);
        });
      }

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((err: unknown) => {
      console.error("Failed to start server:", err);
      process.exit(1);
    });
}
