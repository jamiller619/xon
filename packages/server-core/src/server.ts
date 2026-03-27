import { serve } from "@hono/node-server";
import { DEFAULT_PORT } from "@xon/shared";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { migrateDatabase } from "./migrate.js";

export function boot(): void {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  openDatabase()
    .then(async ({ client, db }) => {
      await migrateDatabase(db);
      const app = createApp(db);
      const server = serve({ fetch: app.fetch, port }, (info) => {
        console.log(`Xon server listening on port ${info.port}`);
      });

      function shutdown(): void {
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
