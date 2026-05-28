import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.ts'
import db, { client } from '../db/db.ts'
import { createLogger, initChildLogger, setLogLevel } from '../logger.ts'
import {
  discoverAndActivatePlugins,
  setPluginDatabase,
} from '../plugins/pluginManager.ts'
import type { ChildToParent, ParentToChild } from './ipc.ts'
import { scanLibrary } from './orchestrator.ts'

const logger = createLogger('scanner-child')

const BUNDLED_PLUGINS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../plugins',
)

function send(msg: ChildToParent): void {
  if (!process.send) {
    logger.error('No IPC channel to parent — child started without fork()')
    return
  }
  process.send(msg)
}

type QueueItem = { jobId: string; libraryId: string }

const queue: QueueItem[] = []
let running = false

async function runNext(): Promise<void> {
  if (running) return
  const item = queue.shift()
  if (!item) return

  running = true
  const { jobId, libraryId } = item

  try {
    const summary = await scanLibrary(db, libraryId, (progress) => {
      send({ type: 'progress', jobId, libraryId, progress })
    })
    send({ type: 'complete', jobId, libraryId, summary })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`Scan failed: ${libraryId}`, { error })
    send({ type: 'error', jobId, libraryId, error })
  } finally {
    running = false
    if (queue.length > 0) {
      void runNext()
    }
  }
}

async function main(): Promise<void> {
  initChildLogger()
  setLogLevel(config.get('log.level'))

  logger.log('Scanner child starting')

  setPluginDatabase(client)

  logger.log(`Loading bundled plugins from ${BUNDLED_PLUGINS_DIR}`)
  await discoverAndActivatePlugins(BUNDLED_PLUGINS_DIR)

  const userPluginsDir = config.get('appdata.pluginsPath')
  logger.log(`Loading user plugins from ${userPluginsDir}`)
  await discoverAndActivatePlugins(userPluginsDir)

  process.on('message', (msg: ParentToChild) => {
    if (msg.type === 'start-scan') {
      queue.push({ jobId: msg.jobId, libraryId: msg.libraryId })
      void runNext()
    } else if (msg.type === 'shutdown') {
      logger.log('Shutdown requested')
      client.close()

      process.removeAllListeners('message')
      process.exit(0)
    }
  })

  send({ type: 'ready' })
  logger.log('Scanner child ready')
}

main().catch((err) => {
  logger.error('Scanner child failed to start', err)
  process.exit(1)
})
