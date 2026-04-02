import { createServer as createHttpsServer } from 'node:https'
import { serve } from '@hono/node-server'
import { DEFAULT_PORT } from '@xon/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { createApp } from './app.js'
import { openDatabase } from './db/db.js'
import { migrateDatabase } from './db/migrate.js'
import { serverSettings } from './db/schema.js'
import { acquireAcmeCert, loadManualCerts } from './http/httpsManager.js'
import { makeStaticMiddleware } from './http/staticFiles.js'
import { emitPluginEvent, setPluginDatabase } from './plugins/pluginManager.js'
import { WS_PATH, createWsServer } from './routes/ws.js'
import { startScheduler } from './scanner/scheduler.js'
import { ensureAdminUser } from './userInit.js'

const SERVER_SETTINGS_ID = 'default'

// Catch uncaught exceptions and unhandled rejections so the process doesn't crash silently.
// These are registered once at module load time, not per boot() call.
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled promise rejection:', reason)
})

export async function boot(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const webClientDir = process.env.WEB_CLIENT_DIR
  const webSsrBundle = process.env.WEB_SSR_BUNDLE

  try {
    const { client, db } = await openDatabase()
    await migrateDatabase(db)
    await ensureAdminUser(db)
    setPluginDatabase(client)
    const { handleUpgrade } = createWsServer()
    const scheduler = await startScheduler(db)

    // Load HTTPS settings to determine server mode
    const settingsRows = await db
      .select()
      .from(serverSettings)
      .where(eq(serverSettings.id, SERVER_SETTINGS_ID))
    const httpsConfig = settingsRows[0]

    let tlsCert: string | undefined
    let tlsKey: string | undefined

    if (httpsConfig?.httpsEnabled) {
      if (
        httpsConfig.acmeEnabled &&
        httpsConfig.acmeDomain &&
        httpsConfig.acmeEmail
      ) {
        // Automatic HTTPS via Let's Encrypt ACME
        const certsDir = httpsConfig.acmeCertsDir ?? './certs'
        console.log(
          `Acquiring ACME certificate for ${httpsConfig.acmeDomain}...`,
        )
        try {
          const certs = await acquireAcmeCert({
            domain: httpsConfig.acmeDomain,
            email: httpsConfig.acmeEmail,
            certsDir,
          })
          tlsCert = certs.cert
          tlsKey = certs.key
          console.log(`ACME certificate ready for ${httpsConfig.acmeDomain}`)
        } catch (err) {
          console.error('Failed to acquire ACME certificate:', err)
          console.log('Falling back to HTTP')
        }
      } else if (httpsConfig.httpsCertPath && httpsConfig.httpsKeyPath) {
        // Manual certificate
        try {
          const certs = await loadManualCerts(
            httpsConfig.httpsCertPath,
            httpsConfig.httpsKeyPath,
          )
          tlsCert = certs.cert
          tlsKey = certs.key
        } catch (err) {
          console.error('Failed to load TLS certificates:', err)
          console.log('Falling back to HTTP')
        }
      }
    }

    const isHttps = !!(tlsCert && tlsKey)
    const apiApp = createApp(db, { isHttps })
    const app = new Hono()
    app.route('/', apiApp)
    if (webClientDir) {
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
      console.log(`Xon server listening on ${protocol}://0.0.0.0:${info.port}`)
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
      emitPluginEvent('server:shutdown', {})
      scheduler.stop()
      server.close(() => {
        client.close()
        process.exit(0)
      })
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }

  // openDatabase()
  //   .then(async ({ client, db }) => {

  //   })
  //   .catch((err: unknown) => {

  //   })
}
