import { type ChildProcess, fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { emitEvent } from '../events.ts'
import { acceptChildLogLine, createLogger } from '../logger.ts'
import type { ChildToParent, ParentToChild, ScanJobId } from './ipc.ts'
import type { ScanSummary } from './orchestrator.ts'
import { scanRegistry } from './scanRegistry.ts'

const logger = createLogger('scanner-handle')

const CHILD_ENTRY = fileURLToPath(new URL('./childMain.ts', import.meta.url))

type PendingJob = {
  libraryId: string
  resolve: (summary: ScanSummary) => void
  reject: (err: Error) => void
}

export type ScannerHandle = {
  startScan: (libraryId: string) => Promise<ScanSummary>
  refreshMetadata: (
    libraryId: string,
    mediaItemId?: string,
  ) => Promise<ScanSummary>
  stop: () => Promise<void>
}

const RESTART_WINDOW_MS = 30_000
const MAX_RESTARTS_PER_WINDOW = 5

export async function startScannerChild(): Promise<ScannerHandle> {
  const pending = new Map<ScanJobId, PendingJob>()
  const restartTimestamps: number[] = []
  let child: ChildProcess
  let stopping = false

  function failPendingJobs(reason: string): void {
    for (const [, job] of pending) {
      const state = scanRegistry.get(job.libraryId)
      if (state && state.status === 'running') {
        state.status = 'failed'
        state.error = reason
      }
      job.reject(new Error(reason))
    }
    pending.clear()
  }

  function handleMessage(msg: ChildToParent): void {
    switch (msg.type) {
      case 'log':
        acceptChildLogLine(msg.line)
        break
      case 'ready':
        logger.log('Scanner child reported ready')
        break
      case 'progress': {
        const state = scanRegistry.get(msg.libraryId)
        if (state) state.progress = msg.progress
        emitEvent({
          type: 'scan:progress',
          payload: { libraryId: msg.libraryId, ...msg.progress },
        })
        break
      }
      case 'complete': {
        const job = pending.get(msg.jobId)
        if (!job) {
          logger.warn(`Received complete for unknown job: ${msg.jobId}`)
          break
        }
        pending.delete(msg.jobId)
        job.resolve(msg.summary)
        break
      }
      case 'error': {
        const job = pending.get(msg.jobId)
        if (!job) {
          logger.warn(`Received error for unknown job: ${msg.jobId}`)
          break
        }
        pending.delete(msg.jobId)
        job.reject(new Error(msg.error))
        break
      }
    }
  }

  function spawnChild(): Promise<void> {
    return new Promise((resolve, reject) => {
      const execArgv = process.execArgv.includes('--experimental-strip-types')
        ? process.execArgv
        : [...process.execArgv, '--experimental-strip-types']

      child = fork(CHILD_ENTRY, [], {
        execArgv,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      })

      let readied = false

      child.on('message', (msg: ChildToParent) => {
        if (!readied && msg.type === 'ready') {
          readied = true
          resolve()
        }
        handleMessage(msg)
      })

      child.once('error', (err) => {
        if (!readied) reject(err)
        logger.error('Scanner child error', err)
      })

      child.once('exit', (code, signal) => {
        if (stopping) return
        logger.warn(
          `Scanner child exited unexpectedly (code=${code}, signal=${signal})`,
        )
        failPendingJobs(`Scanner child exited (code=${code}, signal=${signal})`)

        const now = Date.now()
        while (
          restartTimestamps.length > 0 &&
          now - (restartTimestamps[0] ?? 0) > RESTART_WINDOW_MS
        ) {
          restartTimestamps.shift()
        }
        if (restartTimestamps.length >= MAX_RESTARTS_PER_WINDOW) {
          logger.error(
            `Scanner child crashed ${restartTimestamps.length} times in ${RESTART_WINDOW_MS}ms — not restarting`,
          )
          return
        }
        restartTimestamps.push(now)
        logger.log('Restarting scanner child')
        spawnChild().catch((err) => {
          logger.error('Failed to restart scanner child', err)
        })
      })
    })
  }

  await spawnChild()

  return {
    startScan(libraryId) {
      return new Promise<ScanSummary>((resolve, reject) => {
        const jobId = crypto.randomUUID()
        pending.set(jobId, { libraryId, resolve, reject })
        const msg: ParentToChild = { type: 'start-scan', jobId, libraryId }
        if (!child.send(msg)) {
          pending.delete(jobId)
          reject(new Error('Failed to send start-scan to scanner child'))
        }
      })
    },

    refreshMetadata(libraryId, mediaItemId) {
      return new Promise<ScanSummary>((resolve, reject) => {
        const jobId = crypto.randomUUID()
        pending.set(jobId, { libraryId, resolve, reject })
        const msg: ParentToChild = {
          type: 'refresh-metadata',
          jobId,
          libraryId,
          mediaItemId,
        }
        if (!child.send(msg)) {
          pending.delete(jobId)
          reject(new Error('Failed to send refresh-metadata to scanner child'))
        }
      })
    },

    async stop() {
      stopping = true
      if (!child.connected) return

      const msg: ParentToChild = { type: 'shutdown' }
      child.send(msg)

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn('Scanner child did not exit; sending SIGTERM')
          child.kill('SIGTERM')
          resolve()
        }, 5000)
        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    },
  }
}
