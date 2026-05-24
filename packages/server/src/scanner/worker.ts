import { db } from '../db/db.ts'
import { scanLibrary } from './orchestrator.ts'

const libraryId = process.argv[2]

console.log(`Worker started for library ${libraryId}`)

if (!libraryId) {
  console.error('Usage: worker.ts <libraryId>\n')
  process.exit(1)
}

function send(msg: object) {
  console.log(`${JSON.stringify(msg)}\n`)
}

try {
  const summary = await scanLibrary(db, libraryId)
  send({ type: 'complete', payload: summary })
  process.exit(0)
} catch (err) {
  send({
    type: 'error',
    payload: { error: err instanceof Error ? err.message : String(err) },
  })
  process.exit(1)
}
