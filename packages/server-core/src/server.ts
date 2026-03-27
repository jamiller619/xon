import { serve } from "@hono/node-server";
import { DEFAULT_PORT } from "@xon/shared";
import { app } from "./app.js";

export function boot(): void {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Xon server listening on port ${info.port}`);
  });

  function shutdown(): void {
    server.close(() => {
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
