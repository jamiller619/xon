import type { PluginSettingDefinition } from '@xon/plugin-sdk'
import { Hono } from 'hono'
import {
  activatePlugin,
  deactivatePlugin,
  pluginErrors,
  registry,
} from '../plugins/pluginManager.ts'

export interface PluginAdminInfo {
  id: string
  name: string
  version: string
  type: string
  status: 'active' | 'inactive' | 'loaded' | 'error'
  error?: string
  /** Settings the plugin exposes, saved under `plugins.<id>.<key>` in the app config */
  settings?: Record<string, PluginSettingDefinition>
}

export function makeAdminPluginsRouter(): Hono {
  const router = new Hono()

  /** List all discovered plugins with their status */
  router.get('/', (c) => {
    const plugins: PluginAdminInfo[] = []

    for (const [id, entry] of registry) {
      plugins.push({
        id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        type: entry.manifest.category,
        status: entry.status,
        ...(entry.manifest.settings && { settings: entry.manifest.settings }),
      })
    }

    for (const [id, errEntry] of pluginErrors) {
      plugins.push({
        id,
        name: errEntry.manifest?.name ?? id,
        version: errEntry.manifest?.version ?? 'unknown',
        type: errEntry.manifest?.category ?? 'unknown',
        status: 'error',
        error: errEntry.error,
      })
    }

    return c.json(plugins)
  })

  /** Toggle a plugin between active and inactive */
  router.put('/:name/toggle', async (c) => {
    const name = c.req.param('name')
    const entry = registry.get(name)

    if (!entry) {
      return c.json({ error: `Plugin "${name}" not found` }, 404)
    }

    try {
      if (entry.status === 'active') {
        await deactivatePlugin(name)
      } else {
        await activatePlugin(name)
      }
      return c.json({ id: name, status: entry.status })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      )
    }
  })

  return router
}
