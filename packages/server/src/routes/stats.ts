import { availableParallelism } from 'node:os'
import type { StatsPayload } from '@xon/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import si, { type Systeminformation } from 'systeminformation'

const DISK_REFRESH_MS = 30_000

export function makeStatsRouter(): Hono {
  const router = new Hono()

  // os/system info never changes for the life of the process — collect once
  // and share across every connection instead of re-collecting every tick.
  const staticInfoPromise: Promise<
    [Systeminformation.OsData, Systeminformation.SystemData]
  > = Promise.all([si.osInfo(), si.system()])

  // si.fsSize() spawns `df` — expensive enough that per-second polling isn't
  // worth it. Cache it and dedupe concurrent refreshes across connections.
  let diskCache: Systeminformation.FsSizeData[] = []
  let diskFetchedAt = 0
  let diskInFlight: Promise<Systeminformation.FsSizeData[]> | null = null

  async function getDisk(): Promise<Systeminformation.FsSizeData[]> {
    if (Date.now() - diskFetchedAt < DISK_REFRESH_MS) return diskCache

    diskInFlight ??= si.fsSize().finally(() => {
      diskInFlight = null
    })

    diskCache = await diskInFlight
    diskFetchedAt = Date.now()
    return diskCache
  }

  // Pre-warm both so the very first client connection doesn't pay for them.
  void staticInfoPromise
  void getDisk()

  router.get('/', async (c) => {
    return streamSSE(c, async (stream) => {
      const cores = availableParallelism()
      let prevCPUUsage = process.cpuUsage()
      let prevTime = process.hrtime.bigint()

      const [os, sys] = await staticInfoPromise

      while (true) {
        const [cpu, mem, disk] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          getDisk(),
        ])

        const cpuUsage = process.cpuUsage()
        const time = process.hrtime.bigint()
        const cpuMicros =
          cpuUsage.user +
          cpuUsage.system -
          prevCPUUsage.user -
          prevCPUUsage.system
        const elapsedMicros = Number(time - prevTime) / 1000
        const processCPU =
          elapsedMicros > 0 ? (cpuMicros / elapsedMicros / cores) * 100 : 0

        prevCPUUsage = cpuUsage
        prevTime = time

        const payload: StatsPayload = {
          timestamp: Date.now(),
          cpu: cpu.currentLoad,
          memory: {
            used: mem.used,
            total: mem.total,
            free: mem.free,
          },
          disk: disk.map((d) => ({
            fs: d.fs,
            used: d.used,
            size: d.size,
          })),
          process: {
            cpu: processCPU,
            memory: process.memoryUsage.rss(),
            uptime: process.uptime(),
          },
          system: {
            model: sys.model,
            manufacturer: sys.manufacturer,
            platform: os.platform,
            release: os.release,
            hostname: os.hostname,
          },
        }

        await stream.writeSSE({
          data: JSON.stringify(payload),
        })

        await stream.sleep(1000)
      }
    })
  })

  return router
}
