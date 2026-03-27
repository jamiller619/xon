import { watch } from "node:fs";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { scanLibrary } from "./orchestrator.js";
import { dataSources, libraries } from "./schema.js";

// Parse simple cron expressions. Returns interval in milliseconds, or null if unsupported.
// Supported patterns:
//   "*/N * * * *"   — every N minutes  (N: 1-59)
//   "0 */N * * *"   — every N hours    (N: 1-23)
export function parseCronInterval(expr: string): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return null;

  if (min && /^\*\/\d+$/.test(min) && hour === "*") {
    const n = Number(min.slice(2));
    if (n >= 1 && n <= 59) return n * 60 * 1000;
  }

  if (min === "0" && hour && /^\*\/\d+$/.test(hour)) {
    const n = Number(hour.slice(2));
    if (n >= 1 && n <= 23) return n * 60 * 60 * 1000;
  }

  return null;
}

export type TriggerFn = (db: LibSQLDatabase, libraryId: string) => Promise<unknown>;

export type SchedulerHandle = {
  stop: () => void;
};

const DEBOUNCE_MS = 2000;

export async function startScheduler(
  db: LibSQLDatabase,
  trigger: TriggerFn = (d, id) => scanLibrary(d, id)
): Promise<SchedulerHandle> {
  const intervalTimers: ReturnType<typeof setInterval>[] = [];
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const fsWatchers: ReturnType<typeof watch>[] = [];

  const allLibraries = await db.select().from(libraries);

  for (const lib of allLibraries) {
    // Cron-style scheduled scans
    if (lib.scanSchedule) {
      const interval = parseCronInterval(lib.scanSchedule);
      if (interval !== null) {
        const timer = setInterval(() => {
          trigger(db, lib.id).catch((err: unknown) => {
            console.error(`Scheduled scan failed for library ${lib.id}:`, err);
          });
        }, interval);
        intervalTimers.push(timer);
      }
    }

    // Filesystem watchers for local data sources
    const sources = await db.select().from(dataSources).where(eq(dataSources.libraryId, lib.id));

    for (const source of sources) {
      if (source.type !== "local" || !source.enabled) continue;

      try {
        const watcher = watch(source.path, { recursive: source.recursive }, () => {
          // Debounce: wait DEBOUNCE_MS after the last change event
          const existing = debounceTimers.get(lib.id);
          if (existing !== undefined) clearTimeout(existing);
          const t = setTimeout(() => {
            debounceTimers.delete(lib.id);
            trigger(db, lib.id).catch((err: unknown) => {
              console.error(`Watch-triggered scan failed for library ${lib.id}:`, err);
            });
          }, DEBOUNCE_MS);
          debounceTimers.set(lib.id, t);
        });
        fsWatchers.push(watcher);
      } catch {
        console.error(`Cannot watch path ${source.path} for library ${lib.id}`);
      }
    }
  }

  return {
    stop() {
      for (const t of intervalTimers) clearInterval(t);
      for (const t of debounceTimers.values()) clearTimeout(t);
      for (const w of fsWatchers) w.close();
      intervalTimers.length = 0;
      debounceTimers.clear();
      fsWatchers.length = 0;
    },
  };
}
