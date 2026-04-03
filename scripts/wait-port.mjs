#!/usr/bin/env node
// Usage: node scripts/wait-port.mjs <port>
// Polls until a TCP connection to localhost:<port> succeeds, then exits.
import { createConnection } from 'node:net'

const port = parseInt(process.argv[2], 10)
if (!port) {
  console.error('Usage: wait-port.mjs <port>')
  process.exit(1)
}

await new Promise((resolve) => {
  const check = () => {
    const s = createConnection(port, 'localhost')
    s.on('connect', () => {
      s.destroy()
      resolve()
    })
    s.on('error', () => {
      s.destroy()
      setTimeout(check, 500)
    })
  }
  check()
})
