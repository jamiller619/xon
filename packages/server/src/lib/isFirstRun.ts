import fsp from 'node:fs/promises'
import config from '../config.ts'

export default async function isFirstRun() {
  const dbPath = config.get('appdata.dbPath')
  let exists = false

  try {
    await fsp.access(dbPath)

    exists = true
  } catch {
    exists = false
  }

  return !exists
}
