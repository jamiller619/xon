import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
import { makeSessionMiddleware, requireAuth } from './http/authMiddleware.js'
import { makeCorsMiddleware } from './http/corsMiddleware.ts'
import { onError, onNotFound } from './http/errorMiddleware.ts'
import { makeLoggingMiddleware } from './http/loggingMiddleware.ts'
import { noCacheJSON } from './http/responses.ts'
import { makeSecurityHeadersMiddleware } from './http/securityHeadersMiddleware.ts'
import { pluginRouteDispatcher } from './plugins/pluginRoutes.ts'
import { makeAdminLogsRouter } from './routes/adminLogs.ts'
import { makeAuthRouter } from './routes/auth.ts'
import { makeCollectionsRouter } from './routes/collections.ts'
import { makeConfigRouter } from './routes/config.ts'
import { makeFsRouter } from './routes/fs.ts'
import { makeLibrariesRouter } from './routes/libraries.ts'
import { makeMediaRouter } from './routes/media.ts'
import { makePluginsRouter } from './routes/plugins.ts'
import { makeSearchRouter } from './routes/search.ts'
import { makeStatsRouter } from './routes/stats.ts'
import { makeUsersRouter } from './routes/users.ts'
import type { ScannerHandle } from './scanner/scannerHandle.ts'

export function createApp(
  db?: LibSQLDatabase,
  options?: { isHttps?: boolean; scannerHandle?: ScannerHandle },
): Hono {
  const app = new Hono().basePath('/api')

  // Global error handler: returns consistent JSON for unhandled errors
  app.onError(onError)
  // 404 handler: returns consistent JSON for unknown routes
  app.notFound(onNotFound)
  app.use('/*', makeCorsMiddleware())
  app.use('/*', makeLoggingMiddleware())
  app.use('/*', makeSessionMiddleware())

  // Security headers on all responses
  app.use(
    '/*',
    makeSecurityHeadersMiddleware({ isHttps: options?.isHttps ?? false }),
  )

  app.get('/health', (c) => {
    return noCacheJSON(c, {
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })

  app.route('/config', makeConfigRouter())
  app.route('/fs', makeFsRouter())
  app.route('/stats', makeStatsRouter())

  if (db) {
    app.route('/auth', makeAuthRouter(db))
    if (options?.scannerHandle) {
      app.route('/libraries', makeLibrariesRouter(db, options.scannerHandle))
    }
    app.route('/collections', makeCollectionsRouter(db))
    app.route('/media', makeMediaRouter(db))
    app.route('/search', makeSearchRouter(db))
    app.route('/users', makeUsersRouter(db))
  }

  // All /admin/* routes require an authenticated user
  app.use('/admin/*', requireAuth)
  app.route('/admin/logs', makeAdminLogsRouter())

  // Plugin UI component listing and static asset serving
  app.route('/plugins', makePluginsRouter())

  // Plugin API routes: dispatched dynamically to registered plugin route handlers
  app.all('/plugins/:pluginId/*', pluginRouteDispatcher)

  return app
}

// Default app instance (health-check only, no db) — used by existing tests
export const app = createApp()
