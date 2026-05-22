import type { PluginRouteContext, PluginRouteResponse } from '@xon/plugin-sdk'
import type { Context } from 'hono'
import { registry } from './pluginManager.js'

/**
 * Match a route pattern against a path segment, extracting named params.
 * Returns extracted params or null if no match.
 *
 * e.g. pattern="/items/:id", path="/items/123" → { id: "123" }
 */
function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const vp = pathParts[i]
    if (pp === undefined || vp === undefined) return null
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = vp
    } else if (pp !== vp) {
      return null
    }
  }
  return params
}

/**
 * Hono wildcard handler for /api/plugins/:pluginId/*.
 * Dispatches to the matching registered plugin route handler.
 * Routes are removed automatically when a plugin is deactivated (entry.routes cleared).
 */
export async function pluginRouteDispatcher(c: Context): Promise<Response> {
  const pluginId = c.req.param('pluginId') as string | undefined
  if (!pluginId) {
    return c.json({ error: 'Plugin not found or not active' }, 404) as Response
  }
  const entry = registry.get(pluginId)

  if (!entry || entry.status !== 'active') {
    return c.json({ error: 'Plugin not found or not active' }, 404) as Response
  }

  // Extract plugin-relative path by stripping the /plugins/:pluginId prefix
  const fullPath = c.req.path
  const marker = `/plugins/${pluginId}`
  const markerIndex = fullPath.indexOf(marker)
  const pluginPath =
    markerIndex >= 0 ? fullPath.slice(markerIndex + marker.length) || '/' : '/'

  const method = c.req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

  for (const route of entry.routes) {
    if (route.method !== method) continue
    const params = matchPath(route.path, pluginPath)
    if (params === null) continue

    const pluginContext: PluginRouteContext = {
      req: {
        param: (key: string) => params[key] ?? (c.req.param(key) as string),
        query: (key: string) => c.req.query(key),
        json: <T = unknown>() => c.req.json<T>(),
        header: (key: string) => c.req.header(key),
      },
      json: (data: unknown, status = 200) =>
        c.json(
          data,
          status as Parameters<typeof c.json>[1],
        ) as unknown as PluginRouteResponse,
      text: (text: string, status = 200) =>
        c.text(
          text,
          status as Parameters<typeof c.text>[1],
        ) as unknown as PluginRouteResponse,
    }

    const result = await route.handler(pluginContext)
    return result as unknown as Response
  }

  return c.json({ error: 'Route not found' }, 404) as Response
}
