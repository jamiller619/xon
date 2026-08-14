import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  cachedJson,
  errorCodes,
  errorResponse,
  notFound,
} from '../http/responses.ts'
import { validate } from '../http/validate.ts'
import { registry } from '../plugins/pluginManager.ts'

const pluginParamsSchema = z.object({
  pluginId: z.string().trim().min(1).max(200),
})

export function makePluginsRouter() {
  const router = new Hono()

    /** List all registered UI components from active plugins */
    .get('/ui-components', (c) => {
      const components: {
        pluginId: string
        id: string
        injectionPoint: string
        bundleUrl: string
        label?: string
      }[] = []

      for (const [pluginId, entry] of registry) {
        if (entry.status !== 'active') continue
        for (const component of entry.uiComponents) {
          components.push({
            pluginId,
            id: component.id,
            injectionPoint: component.injectionPoint,
            bundleUrl: component.bundleUrl,
            ...(component.label !== undefined
              ? { label: component.label }
              : {}),
          })
        }
      }

      return cachedJson(c, components)
    })

    /** Serve static assets from a plugin's directory */
    .get(
      '/:pluginId/assets/*',
      validate('param', pluginParamsSchema),
      async (c) => {
        const pluginId = c.req.param('pluginId')
        const entry = registry.get(pluginId)
        if (!entry) {
          return notFound(c, 'Plugin not found')
        }

        // Extract the file path after /assets/
        const url = new URL(c.req.url)
        const prefix = `/api/plugins/${pluginId}/assets/`
        const filePath = url.pathname.slice(prefix.length)

        if (!filePath) {
          return errorResponse(
            c,
            400,
            errorCodes.badRequest,
            'No file path specified',
          )
        }

        // Prevent path traversal
        const resolved = join(entry.pluginDir, 'assets', filePath)
        if (!resolved.startsWith(join(entry.pluginDir, 'assets'))) {
          return errorResponse(c, 403, errorCodes.forbidden, 'Forbidden')
        }

        if (!existsSync(resolved)) {
          return notFound(c, 'Plugin asset not found')
        }

        let size: number
        try {
          const info = await stat(resolved)
          size = info.size
        } catch {
          return notFound(c, 'Plugin asset not found')
        }

        const ext = resolved.split('.').pop() ?? ''
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
        }
        const contentType = mimeTypes[ext] ?? 'application/octet-stream'

        const stream = createReadStream(resolved)
        const readable = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => {
              controller.enqueue(new Uint8Array(chunk as Buffer))
            })
            stream.on('end', () => controller.close())
            stream.on('error', (err) => controller.error(err))
          },
        })

        return new Response(readable, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(size),
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    )

  return router
}
