import { availableParallelism } from 'node:os'
import type { StatsPayload } from '@xon/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import si from 'systeminformation'

export function makeStatsRouter(): Hono {
  const router = new Hono()

  router.get('/', async (c) => {
    return streamSSE(c, async (stream) => {
      const cores = availableParallelism()
      let prevCPUUsage = process.cpuUsage()
      let prevTime = process.hrtime.bigint()

      while (true) {
        const [cpu, mem, disk, os, sys] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.fsSize(),
          si.osInfo(),
          si.system(),
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
