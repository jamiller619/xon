import { createServer as createHttpsServer } from 'node:https'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createApp } from './app.ts'
import db, { client } from './db/db.ts'
import { migrateDatabase } from './db/migrate.ts'
import { eventBus, type XonEvent } from './events.ts'
import { makeStaticMiddleware } from './http/staticFiles.ts'
import { closeLogger, createLogger, initLogger, setLogLevel } from './logger.ts'
import { rebuildThumbnail } from './services/libraryThumbnailService.ts'

const logger = createLogger('server')

import type { AddressInfo } from 'node:net'
import path from 'node:path'
import config from './config.ts'
import {
  discoverAndActivatePlugins,
  emitPluginEvent,
  setPluginAppDataPath,
  setPluginDatabase,
  setPluginSettingsSource,
} from './plugins/pluginManager.ts'
import { triggerLibraryScan } from './routes/scan.ts'
import { createWsServer, WS_PATH } from './routes/ws.ts'
import { startScannerChild } from './scanner/scannerHandle.ts'
import { startScheduler } from './scanner/scheduler.ts'

// Bundled plugins ship alongside the server package, two levels up from packages/server/
const BUNDLED_PLUGINS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../plugins',
)

// Catch uncaught exceptions and unhandled rejections so the process doesn't crash silently.
// These are registered once at module load time, not per boot() call.
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason)
})

export async function boot(): Promise<void> {
  const start = Date.now()
  const port = Number(config.get('network.httpPort'))
  const webClientDir = process.env.WEB_CLIENT_DIR
  const webSsrBundle = process.env.WEB_SSR_BUNDLE

  await initLogger()

  setLogLevel(config.get('log.level'))

  logger.log(`Logger initialized at: ${config.get('appdata.logsPath')}`)
  logger.log(`Log level set to: "${config.get('log.level')}"`)
  logger.log('Node.js version:', process.versions)

  try {
    logger.log('Running database migrations')

    await migrateDatabase(db)

    logger.log('Migrations complete')

    // Regenerate a library's cached thumbnail once its posters have changed,
    // instead of rebuilding on every dashboard request.
    eventBus.on('event', (event: XonEvent) => {
      if (event.type === 'scan:complete') {
        void rebuildThumbnail(db, event.payload.libraryId)
      }
    })

    setPluginDatabase(client)
    logger.log('Plugin database configured')

    setPluginSettingsSource({
      get: (key) => (config.getStore() as unknown as Record<string, unknown>)[key],
    })

    setPluginAppDataPath(config.get('appdata.path'))

    logger.log(`Loading bundled plugins from ${BUNDLED_PLUGINS_DIR}`)
    await discoverAndActivatePlugins(BUNDLED_PLUGINS_DIR)

    const userPluginsDir = config.get('appdata.pluginsPath')
    logger.log(`Loading user plugins from ${userPluginsDir}`)
    await discoverAndActivatePlugins(userPluginsDir)

    const { wss, handleUpgrade } = createWsServer()
    logger.log('WebSocket server created')

    const scannerHandle = await startScannerChild()
    logger.log('Scanner child process ready')

    // Route scheduled/watch-triggered scans through triggerLibraryScan so they
    // update the scan registry and emit scan events, same as manual scans
    const scheduler = await startScheduler(db, async (_, id) => {
      triggerLibraryScan(scannerHandle, id)
    })
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
    const apiApp = createApp(db, { isHttps, scannerHandle })
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

    function handleServerStart(info: AddressInfo) {
      const protocol = tlsCert ? 'https' : 'http'

      logger.log(`Xon Server listening on ${protocol}://0.0.0.0:${info.port}`)

      emitPluginEvent('server:boot', {})

      logger.log(`Xon Server successfully started in ${Date.now() - start}ms`)
    }

    const server = serve(serveOptions, handleServerStart)

    server.on('upgrade', (req, socket, head) => {
      if (req.url === WS_PATH) {
        handleUpgrade(req, socket, head)
      } else {
        socket.destroy()
      }
    })

    let shuttingDown = false
    async function shutdown(): Promise<void> {
      if (shuttingDown) return
      shuttingDown = true
      logger.log('Shutting down')
      emitPluginEvent('server:shutdown', {})
      scheduler.stop()
      await scannerHandle.stop()

      for (const ws of wss.clients) ws.terminate()
      wss.close()

      const forceExit = setTimeout(() => {
        logger.warn('Shutdown timed out; forcing exit')
        process.exit(1)
      }, 5000)
      forceExit.unref()

      server.close(async () => {
        clearTimeout(forceExit)
        client.close()
        logger.log('Shutdown complete')
        await closeLogger()
        process.exit(0)
      })
      ;(server as { closeAllConnections?: () => void }).closeAllConnections?.()
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (err) {
    logger.error('Failed to start server:', err)
    process.exit(1)
  }
}
