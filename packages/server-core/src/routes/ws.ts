import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { XonEvent } from "../events.js";
import { eventBus } from "../events.js";

export const WS_PATH = "/api/v1/ws";

export function createWsServer(): {
  wss: WebSocketServer;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
} {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    const listener = (event: XonEvent) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    };
    eventBus.on("event", listener);
    ws.on("close", () => {
      eventBus.off("event", listener);
    });
  });

  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }

  return { wss, handleUpgrade };
}
