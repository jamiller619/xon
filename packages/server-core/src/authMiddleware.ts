import type { Context, Next } from "hono";
import { verifyAccessToken } from "./routes/auth.js";

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * JWT auth middleware for all /api/v1/* routes except /api/v1/auth/*.
 * Responds 401 if the token is missing or invalid.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const path = c.req.path;
  // Skip auth and health endpoints
  if (path.startsWith("/api/v1/auth/") || path === "/api/v1/health") {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", { id: payload.sub, username: payload.username, role: payload.role });
  return next();
}
