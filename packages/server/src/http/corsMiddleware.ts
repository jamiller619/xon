import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import config from '../config.ts'

export function makeCorsMiddleware(): MiddlewareHandler {
  return cors({
    // origin: 'http://localhost:5173',
    origin: async (origin) => {
      if (!origin) return null
      if (!config.get('network.security.corsEnabled')) return null
      const allowed = config.get('network.security.corsAllowedOrigins') ?? []

      if (allowed.includes('*')) return origin
      return allowed.includes(origin) ? origin : null
    },
    // allowHeaders: ['Authorization', 'Content-Type'],
    // allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  })
}
