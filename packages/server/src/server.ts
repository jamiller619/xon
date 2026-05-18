import { createServer as createHttpsServer } from 'node:https'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
// import { DEFAULT_PORT } from '@xon/shared'
import { Hono } from 'hono'
import { createApp } from './app.js'
import { openDatabase } from './db/db.js'
import { migrateDatabase } from './db/migrate.js'
// import { serverSettings } from './db/schema.js'
// import { acquireAcmeCert, loadManualCerts } from './http/httpsManager.js'
import { makeStaticMiddleware } from './http/staticFiles.js'
import { createLogger, initLogger, setLogLevel } from './logger.js'

process.loadEnvFile('./.env')

const logger = createLogger('server')

import path from 'node:path'
import config from './config.ts'
import {
  discoverAndActivatePlugins,
  emitPluginEvent,
  setPluginDatabase,
} from './plugins/pluginManager.js'
import { createWsServer, WS_PATH } from './routes/ws.js'
import { startScheduler } from './scanner/scheduler.js'

// import { ensureAdminUser } from './userInit.js'

// Bundled plugins ship alongside the server package, two levels up from packages/server/
const BUNDLED_PLUGINS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../plugins',
)

// const SERVER_SETTINGS_ID = 'default'

// Catch uncaught exceptions and unhandled rejections so the process doesn't crash silently.
// These are registered once at module load time, not per boot() call.
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason)
})

export async function boot(): Promise<void> {
  const port = Number(config.get('network.httpPort'))
  // const dataDir = process.env.DATA_DIR ?? './data'
  const webClientDir = process.env.WEB_CLIENT_DIR
  const webSsrBundle = process.env.WEB_SSR_BUNDLE

  await initLogger()

  logger.log(`Logger initialized at  ${config.get('appdata.logsPath')}`)
  logger.log('Node.js version:', process.versions)

  try {
    const { client, db } = await openDatabase(
      path.join(config.get('appdata.dbPath'), 'xon.db'),
    )

    logger.log('Running database migrations')

    await migrateDatabase(db)

    logger.log('Migrations complete')

    // await ensureAdminUser(db)
    // logger.log('Admin user verified')

    setPluginDatabase(client)
    logger.log('Plugin database configured')

    logger.log(`Loading bundled plugins from ${BUNDLED_PLUGINS_DIR}`)
    await discoverAndActivatePlugins(BUNDLED_PLUGINS_DIR)

    const userPluginsDir = config.get('appdata.pluginsPath')
    logger.log(`Loading user plugins from ${userPluginsDir}`)
    await discoverAndActivatePlugins(userPluginsDir)

    // Load server settings (HTTPS config, log level, etc.)
    // const settingsRows = await db
    //   .select()
    //   .from(serverSettings)
    //   .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
    // const httpsConfig = settingsRows[0]
    // logger.log('Server settings loaded')

    // Apply log level
    setLogLevel(config.get('log.level'))
    logger.log(`Log level set to ${config.get('log.level')}`)

    const { handleUpgrade } = createWsServer()
    logger.log('WebSocket server created')

    const scheduler = await startScheduler(db)
    logger.log('Scheduler started')

    let tlsCert: string | undefined
    let tlsKey: string | undefined

    // if (httpsConfig?.httpsEnabled) {
    //   if (
    //     httpsConfig.acmeEnabled &&
    //     httpsConfig.acmeDomain &&
    //     httpsConfig.acmeEmail
    //   ) {
    //     // Automatic HTTPS via Let's Encrypt ACME
    //     const certsDir = httpsConfig.acmeCertsDir ?? './certs'
    //     logger.log(
    //       `Acquiring ACME certificate for ${httpsConfig.acmeDomain}...`,
    //     )
    //     try {
    //       const certs = await acquireAcmeCert({
    //         domain: httpsConfig.acmeDomain,
    //         email: httpsConfig.acmeEmail,
    //         certsDir,
    //       })
    //       tlsCert = certs.cert
    //       tlsKey = certs.key
    //       logger.log(`ACME certificate ready for ${httpsConfig.acmeDomain}`)
    //     } catch (err) {
    //       logger.error('Failed to acquire ACME certificate:', err)
    //       logger.log('Falling back to HTTP')
    //     }
    //   } else if (httpsConfig.httpsCertPath && httpsConfig.httpsKeyPath) {
    //     // Manual certificate
    //     logger.log('Loading TLS certificates')
    //     try {
    //       const certs = await loadManualCerts(
    //         httpsConfig.httpsCertPath,
    //         httpsConfig.httpsKeyPath,
    //       )
    //       tlsCert = certs.cert
    //       tlsKey = certs.key
    //       logger.log('TLS certificates loaded')
    //     } catch (err) {
    //       logger.error('Failed to load TLS certificates:', err)
    //       logger.log('Falling back to HTTP')
    //     }
    //   }
    // } else {
    //   logger.log('HTTPS disabled, using HTTP')
    // }

    const isHttps = !!(tlsCert && tlsKey)
    const apiApp = createApp(db, { isHttps })
    const app = new Hono()

    app.route('/', apiApp)

    if (webClientDir) {
      logger.log(`Serving web client from ${webClientDir}`)
      app.use('/*', makeStaticMiddleware(webClientDir, webSsrBundle))
    }

    const serveOptions =
      tlsCert && tlsKey
        ? {
            fetch: app.fetch,
            port,
            createServer: createHttpsServer,
            serverOptions: { cert: tlsCert, key: tlsKey },
          }
        : { fetch: app.fetch, port }

    const server = serve(serveOptions, (info) => {
      const protocol = tlsCert ? 'https' : 'http'
      logger.log(`Xon server listening on ${protocol}://0.0.0.0:${info.port}`)
      emitPluginEvent('server:boot', {})
    })

    server.on('upgrade', (req, socket, head) => {
      if (req.url === WS_PATH) {
        handleUpgrade(req, socket, head)
      } else {
        socket.destroy()
      }
    })

    function shutdown(): void {
      logger.log('Shutting down')
      emitPluginEvent('server:shutdown', {})
      scheduler.stop()
      server.close(() => {
        client.close()
        logger.log('Shutdown complete')
        process.exit(0)
      })
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (err) {
    logger.error('Failed to start server:', err)
    process.exit(1)
  }
}
