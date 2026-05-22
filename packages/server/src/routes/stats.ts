import type { StatsPayload } from '@xon/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import si from 'systeminformation'

export function makeStatsRouter(): Hono {
  const router = new Hono()

  router.get('/', async (c) => {
    return streamSSE(c, async (stream) => {
      while (true) {
        const [cpu, mem, disk, os, sys] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.fsSize(),
          si.osInfo(),
          si.system(),
        ])

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
          uptime: si.time().uptime,
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
