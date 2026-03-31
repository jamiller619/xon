import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registry } from '../pluginManager.js';

export function makePluginsRouter(): Hono {
  const router = new Hono();

  /** List all registered UI components from active plugins */
  router.get('/ui-components', (c) => {
    const components: {
      pluginId: string;
      id: string;
      injectionPoint: string;
      bundleUrl: string;
      label?: string;
    }[] = [];

    for (const [pluginId, entry] of registry) {
      if (entry.status !== 'active') continue;
      for (const component of entry.uiComponents) {
        components.push({
          pluginId,
          id: component.id,
          injectionPoint: component.injectionPoint,
          bundleUrl: component.bundleUrl,
          ...(component.label !== undefined ? { label: component.label } : {}),
        });
      }
    }

    return c.json(components);
  });

  /** Serve static assets from a plugin's directory */
  router.get('/:pluginId/assets/*', async (c) => {
    const pluginId = c.req.param('pluginId');
    const entry = registry.get(pluginId);
    if (!entry) {
      return c.json({ error: 'Plugin not found' }, 404);
    }

    // Extract the file path after /assets/
    const url = new URL(c.req.url);
    const prefix = `/api/v1/plugins/${pluginId}/assets/`;
    const filePath = url.pathname.slice(prefix.length);

    if (!filePath) {
      return c.json({ error: 'No file path specified' }, 400);
    }

    // Prevent path traversal
    const resolved = join(entry.pluginDir, 'assets', filePath);
    if (!resolved.startsWith(join(entry.pluginDir, 'assets'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (!existsSync(resolved)) {
      return c.json({ error: 'Not found' }, 404);
    }

    let size: number;
    try {
      const info = await stat(resolved);
      size = info.size;
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }

    const ext = resolved.split('.').pop() ?? '';
    const mimeTypes: Record<string, string> = {
      js: 'application/javascript',
      mjs: 'application/javascript',
      css: 'text/css',
      json: 'application/json',
      html: 'text/html',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      woff2: 'font/woff2',
      woff: 'font/woff',
    };
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';

    const stream = createReadStream(resolved);
    const readable = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk as Buffer));
        });
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  });

  return router;
}
