import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Context, Next } from 'hono';
import { apiTokens, users } from '../db/schema.js';
import { verifyAccessToken } from '../routes/auth.js';
import { hashApiToken } from '../routes/users.js';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * JWT auth middleware for all /api/v1/* routes except /api/v1/auth/*.
 * Also accepts API tokens (xon_<hex>) in the Authorization Bearer header.
 * Responds 401 if the token is missing or invalid.
 */
export function makeAuthMiddleware(db?: LibSQLDatabase) {
  return async function authMiddleware(c: Context, next: Next) {
    const path = c.req.path;
    // Skip auth, health, and docs endpoints
    if (
      path.startsWith('/api/v1/auth/') ||
      path === '/api/v1/health' ||
      path === '/api/v1/docs' ||
      path.startsWith('/api/v1/docs/')
    ) {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);

    // Try JWT first
    const payload = await verifyAccessToken(token);
    if (payload) {
      c.set('user', {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
      });
      return next();
    }

    // Try API token (xon_ prefix or raw hash lookup)
    if (db && token.startsWith('xon_')) {
      const tokenHash = hashApiToken(token);
      const rows = await db
        .select({
          id: apiTokens.id,
          userId: apiTokens.userId,
          expiresAt: apiTokens.expiresAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.tokenHash, tokenHash))
        .limit(1);

      const apiToken = rows[0];
      if (apiToken) {
        // Check expiry
        if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
          return c.json({ error: 'Unauthorized' }, 401);
        }

        // Load user details
        const userRows = await db
          .select({ id: users.id, username: users.username, role: users.role })
          .from(users)
          .where(eq(users.id, apiToken.userId))
          .limit(1);

        const user = userRows[0];
        if (user) {
          // Update lastUsedAt asynchronously (don't block the request)
          db.update(apiTokens)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiTokens.id, apiToken.id))
            .catch(() => {});

          c.set('user', {
            id: user.id,
            username: user.username,
            role: user.role,
          });
          return next();
        }
      }
    }

    return c.json({ error: 'Unauthorized' }, 401);
  };
}

/**
 * Default auth middleware (no DB — JWT only). Kept for backward compatibility with tests.
 */
export async function authMiddleware(c: Context, next: Next) {
  return makeAuthMiddleware()(c, next);
}
