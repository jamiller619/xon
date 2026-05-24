import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ScanSummary } from './orchestrator.ts'

const isTs = import.meta.url.endsWith('.ts')
const workerExt = isTs ? '.ts' : '.js'
const workerPath = new URL(`./worker${workerExt}`, import.meta.url).pathname
const nodeArgs = isTs
  ? ['--experimental-strip-types', workerPath]
  : [workerPath]

export function spawnScan(libraryId: string): Promise<ScanSummary> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, libraryId], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    // biome-ignore lint/style/noNonNullAssertion: this works
    const rl = createInterface({ input: child.stdout! })

    rl.on('line', (line) => {
      let msg: { type: string; payload: unknown }
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }

      if (msg.type === 'complete') {
        resolve(msg.payload as ScanSummary)
      } else if (msg.type === 'error') {
        const payload = msg.payload as { error: string }
        reject(new Error(payload.error))
      }
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Scanner worker exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}
