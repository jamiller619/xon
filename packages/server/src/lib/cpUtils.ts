import { spawn } from 'node:child_process'
import { outputStream } from '@simple-libs/child-process-utils'
import { createLogger } from '../logger.ts'

export async function executeChildProcess(
  logPrefix: string,
  filePath: string,
): Promise<void> {
  const logger = createLogger(logPrefix)

  const proc = spawn(process.execPath, ['--experimental-strip-types', filePath])

  for await (const chunk of outputStream(proc)) {
    logger.log(chunk.toString('utf-8'))
  }
}
