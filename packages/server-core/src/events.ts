import { EventEmitter } from "node:events";

export type XonEvent =
  | {
      type: "scan:progress";
      payload: {
        libraryId: string;
        fileCount: number;
        currentFile: string | null;
        percentComplete: number;
      };
    }
  | {
      type: "scan:complete";
      payload: {
        libraryId: string;
        newItems: number;
        updatedItems: number;
        removedItems: number;
        totalDiscovered: number;
      };
    }
  | { type: "scan:error"; payload: { libraryId: string; error: string } }
  | { type: "media:added"; payload: { libraryId: string; mediaItemId: string } }
  | { type: "media:removed"; payload: { libraryId: string; mediaItemId: string } };

export const eventBus = new EventEmitter();

export function emitEvent(event: XonEvent): void {
  eventBus.emit("event", event);
}
