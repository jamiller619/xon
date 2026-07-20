import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.ts'
import db, { client } from '../db/db.ts'
import { createLogger, initChildLogger, setLogLevel } from '../logger.ts'
import {
  discoverAndActivatePlugins,
  setPluginAppDataPath,
  setPluginDatabase,
  setPluginSettingsSource,
} from '../plugins/pluginManager.ts'
import type { ChildToParent, ParentToChild } from './ipc.ts'
import {
  refreshMetadata,
  type ScanProgress,
  scanLibrary,
} from './orchestrator.ts'

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

type QueueItem = {
  jobId: string
  libraryId: string
  kind: 'scan' | 'refresh'
  mediaItemId?: string | undefined
}

const queue: QueueItem[] = []
let running = false

async function runNext(): Promise<void> {
  if (running) return
  const item = queue.shift()
  if (!item) return

  running = true
  const { jobId, libraryId, kind, mediaItemId } = item

  try {
    const report = (progress: ScanProgress) => {
      send({ type: 'progress', jobId, libraryId, progress })
    }
    const summary =
      kind === 'refresh'
        ? await refreshMetadata(db, libraryId, mediaItemId, report)
        : await scanLibrary(db, libraryId, report)
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

  setPluginSettingsSource({
    get: (key) => (config.getStore() as unknown as Record<string, unknown>)[key],
  })

  setPluginAppDataPath(config.get('appdata.path'))

  logger.log(`Loading bundled plugins from ${BUNDLED_PLUGINS_DIR}`)
  await discoverAndActivatePlugins(BUNDLED_PLUGINS_DIR)

  const userPluginsDir = config.get('appdata.pluginsPath')
  logger.log(`Loading user plugins from ${userPluginsDir}`)
  await discoverAndActivatePlugins(userPluginsDir)

  process.on('message', (msg: ParentToChild) => {
    if (msg.type === 'start-scan') {
      queue.push({ jobId: msg.jobId, libraryId: msg.libraryId, kind: 'scan' })
      void runNext()
    } else if (msg.type === 'refresh-metadata') {
      queue.push({
        jobId: msg.jobId,
        libraryId: msg.libraryId,
        kind: 'refresh',
        mediaItemId: msg.mediaItemId,
      })
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
