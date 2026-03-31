import { boot } from "@xon/server-core";
import { DEFAULT_PORT } from "@xon/shared";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
console.log(`Starting Xon server on http://localhost:${port}`);

boot();
