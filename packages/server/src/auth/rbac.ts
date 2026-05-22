import type { UserRole } from '@xon/shared'
import type { Context, MiddlewareHandler, Next } from 'hono'

const ROLE_RANK: Record<string, number> = {
  guest: 0,
  user: 1,
  manager: 2,
  admin: 3,
}

/**
 * RBAC middleware factory. Returns a middleware that requires the authenticated user
 * to have at least the given role in the hierarchy: guest < user < admin.
 * Responds 403 with a descriptive message if the role requirement is not met.
 */
export function requireRole(minRole: UserRole): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = c.get('user')
    const userRank = ROLE_RANK[user?.role ?? ''] ?? -1
    const minRank = ROLE_RANK[minRole] ?? 99
    if (userRank < minRank) {
      return c.json(
        { error: `Forbidden: requires ${minRole} role or higher` },
        403,
      )
    }
    return next()
  }
}
