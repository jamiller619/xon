import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Hono } from 'hono'
// import { cors } from 'hono/cors'
import { makeSessionMiddleware, requireAuth } from './auth/middleware.ts'
import { makeConfigRouter } from './config/config.router.ts'
import { makeCorsMiddleware } from './http/corsMiddleware.ts'
// import config from './config.ts'
import { onError, onNotFound } from './http/errorMiddleware.ts'
import { makeLoggingMiddleware } from './http/loggingMiddleware.ts'
// import { makeRateLimitMiddleware } from './http/rateLimitMiddleware.ts'
import { makeSecurityHeadersMiddleware } from './http/securityHeadersMiddleware.ts'
import { pluginRouteDispatcher } from './plugins/pluginRoutes.ts'
// import { makeAdminAiSettingsRouter } from './routes/adminAiSettings.ts'
import {
  makeAdminBackupRouter,
  makeAdminRestoreRouter,
} from './routes/adminBackup.ts'
// import { makeAdminBackupMediaRouter } from './routes/adminBackupMedia.ts'
// import { makeAdminBackupTargetsRouter } from './routes/adminBackupTargets.ts'
// import { makeAdminBackupVerifyRouter } from './routes/adminBackupVerify.ts'
import { makeAdminHealthRouter } from './routes/adminHealth.ts'
import { makeAdminLibraryAccessRouter } from './routes/adminLibraryAccess.ts'
import { makeAdminLogsRouter } from './routes/adminLogs.ts'
import { makeAdminPluginsRouter } from './routes/adminPlugins.ts'
import { makeAdminServerSettingsRouter } from './routes/adminServerSettings.ts'
import { makeAdminSettingsRouter } from './routes/adminSettings.ts'
import { makeAdminUsersRouter } from './routes/adminUsers.ts'
// import { makeAiRouter } from './routes/ai.ts'
import { makeAuthRouter } from './routes/auth.ts'
import { makeDocsRouter } from './routes/docs.ts'
import { makeFsRouter } from './routes/fs.ts'
import { makeGroupsRouter } from './routes/groups.ts'
import { makeLibrariesRouter } from './routes/libraries.ts'
// import { makeMatchingRouter } from './routes/matching.ts'
import { makeMediaRouter } from './routes/media.ts'
import { makePluginsRouter } from './routes/plugins.ts'
import { makeSearchRouter } from './routes/search.ts'
import { makeStatsRouter } from './routes/stats.ts'
// import { makeSyncRouter } from './routes/sync.ts'
import { makeThemesRouter } from './routes/themes.ts'
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

  // if (db) {
  //   // Rate limiting: auth endpoints (strict), general API
  //   app.use('/auth/*', makeRateLimitMiddleware(db, 'auth'))
  //   app.use('/*', makeRateLimitMiddleware(db, 'general'))
  // }

  // Reverse proxy: expose X-Forwarded-Proto via a response header so clients can
  // detect whether the upstream connection was HTTPS when behind a trusted proxy.
  // if (db) {
  //   app.use('/*', async (c, next) => {
  // const rows = await db
  //   .select()
  //   .from(serverSettings)
  //   .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
  // const settings = rows[0]
  // if (settings?.trustProxy) {
  //   const proto = c.req.header('x-forwarded-proto')
  //   if (proto) {
  //     c.header('X-Forwarded-Proto', proto)
  //   }
  //   const forwardedFor = c.req.header('x-forwarded-for')
  //   if (forwardedFor) {
  //     c.set(
  //       'clientIp' as never,
  //       forwardedFor.split(',')[0]?.trim() ?? 'unknown',
  //     )
  //   }
  // }
  // return next()
  //   })
  // }

  // Auth middleware on all routes (skips /api/auth/* internally)
  // Passes db so API tokens can be verified alongside JWT access tokens
  // app.use('/*', makeSessionMiddleware())

  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // API docs (OpenAPI spec + Swagger UI) — no auth required
  app.route('/docs', makeDocsRouter())

  if (db) {
    app.route('/auth', makeAuthRouter(db))
    app.route('/fs', makeFsRouter(db))
    if (options?.scannerHandle) {
      app.route('/libraries', makeLibrariesRouter(db, options.scannerHandle))
    }
    app.route('/groups', makeGroupsRouter(db))
    // app.route('/ai', makeAiRouter(db))
    // app.route('/matching', makeMatchingRouter(db))
    app.route('/media', makeMediaRouter(db))
    app.route('/search', makeSearchRouter(db))
    app.route('/users', makeUsersRouter(db))
    // app.route('/sync/profiles', makeSyncRouter(db))
    app.route('/stats', makeStatsRouter())
    app.route('/config', makeConfigRouter())
  }

  // All /admin/* routes require an authenticated user
  app.use('/admin/*', requireAuth())

  // Admin: user management
  if (db) {
    app.route('/admin/users', makeAdminUsersRouter(db))
    app.route('/admin/libraries', makeAdminLibraryAccessRouter(db))
    // app.route('/admin/ai-settings', makeAdminAiSettingsRouter(db))
    app.route('/admin/backup/metadata', makeAdminBackupRouter(db))
    app.route('/admin/restore/metadata', makeAdminRestoreRouter(db))
    // app.route('/admin/backup/targets', makeAdminBackupTargetsRouter(db))
    // app.route('/admin/backup/media', makeAdminBackupMediaRouter(db))
    // app.route('/admin/backup/verify', makeAdminBackupVerifyRouter(db))
    app.route('/admin/server-settings', makeAdminServerSettingsRouter())
    app.route('/admin/settings', makeAdminSettingsRouter())
    app.route('/admin/health', makeAdminHealthRouter(db))
    app.route('/admin/logs', makeAdminLogsRouter())
  }

  // Admin: plugin management
  app.route('/admin/plugins', makeAdminPluginsRouter())

  // Theme plugin listing
  app.route('/themes', makeThemesRouter())

  // Plugin UI component listing and static asset serving
  app.route('/plugins', makePluginsRouter())

  // Plugin API routes: dispatched dynamically to registered plugin route handlers
  app.all('/plugins/:pluginId/*', pluginRouteDispatcher)

  return app
}

// Default app instance (health-check only, no db) — used by existing tests
export const app = createApp()
