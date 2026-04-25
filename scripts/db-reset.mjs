import { rmSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = process.env.DATA_DIR ?? 'packages/server/data'

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(join(dataDir, `xon.db${suffix}`), { force: true })
}

console.log(`Database reset (${dataDir}/xon.db)`)
