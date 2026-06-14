import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { eventBus, type XonEvent } from '../events.ts'
import auth from '../lib/auth.ts'

export const WS_PATH = '/api/ws'

type UpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void

/** Convert Node's IncomingHttpHeaders into a web-standard Headers object. */
function toFetchHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) result.append(key, v)
    } else {
      result.set(key, value)
    }
  }
  return result
}

export function createWsServer(): {
  wss: WebSocketServer
  handleUpgrade: UpgradeHandler
} {
  const wss = new WebSocketServer({ noServer: true })

  wss.on(
    'connection',
    (ws: WebSocket, _req: IncomingMessage, isAdmin = false) => {
      const listener = (event: XonEvent) => {
        if (ws.readyState !== ws.OPEN) return
        // Server log output may contain sensitive paths/data — admins only.
        if (event.type === 'log:line' && !isAdmin) return
        ws.send(JSON.stringify(event))
      }
      eventBus.on('event', listener)
      ws.on('close', () => {
        eventBus.off('event', listener)
      })
    },
  )

  function handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    // Authenticate the upgrade using the session cookie sent with the
    // handshake. Reject unauthenticated connections before completing it.
    void auth.api
      .getSession({ headers: toFetchHeaders(req.headers) })
      .catch(() => null)
      .then((session) => {
        if (!session) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
        const isAdmin = session.user.role === 'admin'
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, isAdmin)
        })
      })
  }

  return { wss, handleUpgrade }
}
