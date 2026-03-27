import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { emitEvent, eventBus } from "../events.js";
import { createWsServer } from "./ws.js";

describe("WebSocket server", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeEach(async () => {
    const { handleUpgrade } = createWsServer();
    server = createServer();
    server.on("upgrade", (req, socket, head) => {
      handleUpgrade(req, socket, head);
    });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    eventBus.removeAllListeners("event");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function connect(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    return ws;
  }

  async function collectMessages(ws: WebSocket, count: number): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const received: unknown[] = [];
      ws.on("message", (data) => {
        received.push(JSON.parse(data.toString()));
        if (received.length >= count) resolve(received);
      });
      ws.on("error", reject);
      setTimeout(() => resolve(received), 200);
    });
  }

  it("sends scan:progress events to connected clients as JSON", async () => {
    const ws = await connect();
    const messagesPromise = collectMessages(ws, 1);

    emitEvent({
      type: "scan:progress",
      payload: { libraryId: "lib-1", fileCount: 10, currentFile: "test.mp4", percentComplete: 50 },
    });

    const received = await messagesPromise;
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      type: "scan:progress",
      payload: { libraryId: "lib-1", fileCount: 10, currentFile: "test.mp4", percentComplete: 50 },
    });
    ws.close();
  });

  it("sends all event types to connected clients", async () => {
    const ws = await connect();
    const messagesPromise = collectMessages(ws, 5);

    emitEvent({
      type: "scan:progress",
      payload: { libraryId: "l", fileCount: 1, currentFile: null, percentComplete: 0 },
    });
    emitEvent({
      type: "scan:complete",
      payload: {
        libraryId: "l",
        newItems: 1,
        updatedItems: 0,
        removedItems: 0,
        totalDiscovered: 1,
      },
    });
    emitEvent({ type: "scan:error", payload: { libraryId: "l", error: "oops" } });
    emitEvent({ type: "media:added", payload: { libraryId: "l", mediaItemId: "m-1" } });
    emitEvent({ type: "media:removed", payload: { libraryId: "l", mediaItemId: "m-2" } });

    const received = await messagesPromise;
    expect(received).toHaveLength(5);
    expect((received[0] as { type: string }).type).toBe("scan:progress");
    expect((received[1] as { type: string }).type).toBe("scan:complete");
    expect((received[2] as { type: string }).type).toBe("scan:error");
    expect((received[3] as { type: string }).type).toBe("media:added");
    expect((received[4] as { type: string }).type).toBe("media:removed");
    ws.close();
  });

  it("stops sending events after client disconnects", async () => {
    const ws = await connect();

    // Close the connection and wait for it to fully close
    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
      ws.close();
    });

    // Allow close handler to run
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // eventBus listener should have been removed — emitting should not throw
    expect(() => {
      emitEvent({ type: "scan:error", payload: { libraryId: "l", error: "test" } });
    }).not.toThrow();

    // Verify listener count is back to 0
    expect(eventBus.listenerCount("event")).toBe(0);
  });

  it("broadcasts to multiple connected clients simultaneously", async () => {
    const ws1 = await connect();
    const ws2 = await connect();
    const p1 = collectMessages(ws1, 1);
    const p2 = collectMessages(ws2, 1);

    emitEvent({ type: "media:added", payload: { libraryId: "lib-1", mediaItemId: "item-1" } });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect((r1[0] as { type: string }).type).toBe("media:added");
    expect((r2[0] as { type: string }).type).toBe("media:added");
    ws1.close();
    ws2.close();
  });
});
