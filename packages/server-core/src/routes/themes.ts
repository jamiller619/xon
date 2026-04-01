import { Hono } from 'hono';
import { registry } from '../plugins/pluginManager.js';

export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  active: boolean;
  cssUrl?: string;
  jsUrl?: string;
}

export function makeThemesRouter(): Hono {
  const router = new Hono();

  /** List all installed Theme plugins with their asset URLs */
  router.get('/', (c) => {
    const themes: ThemeInfo[] = [];

    for (const [pluginId, entry] of registry) {
      if (entry.manifest.category !== 'Theme') continue;
      const assets = entry.manifest.themeAssets;
      themes.push({
        id: pluginId,
        name: entry.manifest.name,
        description: entry.manifest.description,
        active: entry.status === 'active',
        ...(assets?.cssFile
          ? { cssUrl: `/api/v1/plugins/${pluginId}/assets/${assets.cssFile}` }
          : {}),
        ...(assets?.jsFile
          ? { jsUrl: `/api/v1/plugins/${pluginId}/assets/${assets.jsFile}` }
          : {}),
      });
    }

    return c.json(themes);
  });

  return router;
}
