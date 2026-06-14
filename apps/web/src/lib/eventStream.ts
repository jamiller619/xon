import type { XonEvent } from './events'

/**
 * Single shared WebSocket connection to the server event bus (`/api/ws`).
 *
 * Auth is handled by the session cookie, which the browser sends automatically
 * with the same-origin handshake — no token needs to be passed. The socket is
 * reference-counted: it opens on the first subscriber and closes when the last
 * one leaves, with exponential-backoff reconnect while subscribers remain.
 */

type Listener = (event: XonEvent) => void

const listeners = new Set<Listener>()
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let attempts = 0

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/ws`
}

function open(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  const ws = new WebSocket(wsUrl())
  socket = ws

  ws.onopen = () => {
    attempts = 0
  }

  ws.onmessage = (e) => {
    let event: XonEvent
    try {
      event = JSON.parse(e.data as string) as XonEvent
    } catch {
      return
    }
    for (const listener of listeners) listener(event)
  }

  ws.onclose = () => {
    if (socket === ws) socket = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws.close()
  }
}

function scheduleReconnect(): void {
  if (listeners.size === 0 || reconnectTimer) return
  const delay = Math.min(1000 * 2 ** attempts, 15_000)
  attempts += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (listeners.size > 0) open()
  }, delay)
}

/**
 * Subscribe to every server event. Returns an unsubscribe function; the shared
 * socket is closed once no subscribers remain.
 */
export function subscribeToEvents(listener: Listener): () => void {
  listeners.add(listener)
  open()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      socket?.close()
      socket = null
      attempts = 0
    }
  }
}
