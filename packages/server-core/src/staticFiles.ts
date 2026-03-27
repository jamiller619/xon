import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { MiddlewareHandler } from "hono";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

// Vite (and most bundlers) place hashed assets under /assets/
// These can be cached indefinitely since the URL changes when content changes.
function getCacheControl(urlPath: string): string {
  if (urlPath.endsWith(".html") || urlPath === "/") {
    return "no-cache";
  }
  if (urlPath.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

export function makeStaticMiddleware(webClientDir: string): MiddlewareHandler {
  return async (c, next) => {
    const urlPath = new URL(c.req.url).pathname;

    // Only serve non-API paths
    if (urlPath.startsWith("/api/")) {
      return next();
    }

    async function tryServeFile(filePath: string): Promise<Response | null> {
      try {
        await stat(filePath);
        const buf = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
        return new Response(buf, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": getCacheControl(urlPath),
          },
        });
      } catch {
        return null;
      }
    }

    // Try exact path match
    const exactPath = join(webClientDir, urlPath);
    const exactResponse = await tryServeFile(exactPath);
    if (exactResponse) {
      return exactResponse;
    }

    // SPA fallback: serve index.html
    const indexPath = join(webClientDir, "index.html");
    const indexResponse = await tryServeFile(indexPath);
    if (indexResponse) {
      return new Response(indexResponse.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    return next();
  };
}
