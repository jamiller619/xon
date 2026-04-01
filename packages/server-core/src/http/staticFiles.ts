import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MiddlewareHandler } from 'hono';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

// Vite (and most bundlers) place hashed assets under /assets/
// These can be cached indefinitely since the URL changes when content changes.
function getCacheControl(urlPath: string): string {
  if (urlPath.endsWith('.html') || urlPath === '/') {
    return 'no-cache';
  }
  if (urlPath.includes('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

interface SSRModule {
  render: (url: string) => { html: string };
}

interface ViteManifestEntry {
  file: string;
  css?: string[];
  isEntry?: boolean;
}

// Cached SSR module and inlined CSS (loaded once per process)
let ssrModuleCache: SSRModule | null | undefined = undefined;
let ssrCssCache: string | null = null;

function installBrowserPolyfills(): void {
  const g = globalThis as Record<string, unknown>;
  // pdfjs-dist references DOMMatrix at module initialization time
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
    };
  }
}

async function loadSsrModule(ssrBundlePath: string): Promise<SSRModule | null> {
  if (ssrModuleCache !== undefined) return ssrModuleCache;
  try {
    await stat(ssrBundlePath);
    // Install browser polyfills before loading SSR bundle so bundled libs (e.g. pdfjs-dist)
    // can initialize without throwing on missing browser globals.
    installBrowserPolyfills();
    const mod = (await import(pathToFileURL(ssrBundlePath).href)) as SSRModule;
    ssrModuleCache = mod;
    return mod;
  } catch {
    ssrModuleCache = null;
    return null;
  }
}

async function loadSsrCss(webClientDir: string): Promise<string> {
  if (ssrCssCache !== null) return ssrCssCache;
  const manifestPath = join(webClientDir, '.vite', 'manifest.json');
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as Record<string, ViteManifestEntry>;
    const cssFiles = new Set<string>();
    for (const entry of Object.values(manifest)) {
      if (entry.css) {
        for (const cssFile of entry.css) cssFiles.add(cssFile);
      }
    }
    const cssContents = await Promise.all(
      [...cssFiles].map((f) => readFile(join(webClientDir, f), 'utf8')),
    );
    ssrCssCache = cssContents.join('\n');
    return ssrCssCache;
  } catch {
    ssrCssCache = '';
    return '';
  }
}

async function renderSsrHtml(
  urlPath: string,
  webClientDir: string,
  ssrBundlePath: string,
): Promise<string | null> {
  const ssrModule = await loadSsrModule(ssrBundlePath);
  if (!ssrModule) return null;

  const indexPath = join(webClientDir, 'index.html');
  let template: string;
  try {
    template = await readFile(indexPath, 'utf8');
  } catch {
    return null;
  }

  let renderedHtml: string;
  try {
    const { html } = ssrModule.render(urlPath);
    renderedHtml = html;
  } catch {
    // SSR render failed — fall back to SPA shell
    renderedHtml = '';
  }

  // Inline critical CSS in <head>
  const css = await loadSsrCss(webClientDir);
  const styleTag = css ? `<style>${css}</style>` : '';
  const htmlWithCss = styleTag
    ? template.replace('</head>', `${styleTag}\n  </head>`)
    : template;

  // Inject SSR-rendered HTML at the outlet
  return htmlWithCss.replace('<!--ssr-outlet-->', renderedHtml);
}

export function makeStaticMiddleware(
  webClientDir: string,
  ssrBundlePath?: string,
): MiddlewareHandler {
  return async (c, next) => {
    const urlPath = new URL(c.req.url).pathname;

    // Only serve non-API paths
    if (urlPath.startsWith('/api/')) {
      return next();
    }

    async function tryServeFile(filePath: string): Promise<Response | null> {
      try {
        await stat(filePath);
        const buf = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
        return new Response(buf, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': getCacheControl(urlPath),
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

    // SSR: pre-render HTML for non-asset SPA routes
    if (ssrBundlePath && !urlPath.includes('.')) {
      const ssrHtml = await renderSsrHtml(urlPath, webClientDir, ssrBundlePath);
      if (ssrHtml) {
        return new Response(ssrHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    // SPA fallback: serve index.html
    const indexPath = join(webClientDir, 'index.html');
    const indexResponse = await tryServeFile(indexPath);
    if (indexResponse) {
      return new Response(indexResponse.body, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return next();
  };
}
