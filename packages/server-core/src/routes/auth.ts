import { eq, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../password.js";
import { refreshTokens, users } from "../schema.js";
import { validate } from "../validate.js";

const REFRESH_COOKIE_NAME = "rt";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? "xon-dev-secret-change-in-production";
}

export async function signAccessToken(
  userId: string,
  username: string,
  role: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, username, role, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS },
    getJwtSecret(),
    "HS256"
  );
}

async function signRefreshToken(tokenId: string, userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, jti: tokenId, type: "refresh", iat: now, exp: now + REFRESH_TOKEN_TTL_SECONDS },
    getJwtSecret(),
    "HS256"
  );
}

export async function verifyAccessToken(
  token: string
): Promise<{ sub: string; username: string; role: string } | null> {
  try {
    const payload = await verify(token, getJwtSecret(), "HS256");
    if (
      typeof payload.sub === "string" &&
      typeof payload.username === "string" &&
      typeof payload.role === "string"
    ) {
      return { sub: payload.sub, username: payload.username, role: payload.role };
    }
    return null;
  } catch {
    return null;
  }
}

export function makeAuthRouter(db: LibSQLDatabase): Hono {
  const router = new Hono();

  router.post(
    "/login",
    validate("json", z.object({ username: z.string().min(1), password: z.string().min(1) })),
    async (c) => {
      const { username, password } = c.req.valid("json");

      const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);

      const user = rows[0];
      if (!user) {
        return c.json({ error: "Invalid credentials" }, 401);
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        return c.json({ error: "Invalid credentials" }, 401);
      }

      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

      await db.insert(refreshTokens).values({
        id: tokenId,
        userId: user.id,
        expiresAt,
      });

      const accessToken = await signAccessToken(user.id, user.username, user.role);
      const refreshToken = await signRefreshToken(tokenId, user.id);

      // Clean up expired tokens for this user
      await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));

      setCookie(c, REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/api/v1/auth",
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      });

      return c.json({ accessToken, refreshToken });
    }
  );

  router.post("/refresh", async (c) => {
    const body = await c.req.json().catch(() => null);
    const rawToken =
      (body?.refreshToken as string | undefined) ?? getCookie(c, REFRESH_COOKIE_NAME);
    if (!rawToken) {
      return c.json({ error: "Missing refresh token" }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verify(rawToken, getJwtSecret(), "HS256");
    } catch {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    if (payload.type !== "refresh" || typeof payload.jti !== "string") {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    const rows = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti))
      .limit(1);

    const stored = rows[0];
    if (!stored) {
      return c.json({ error: "Refresh token not found or already used" }, 401);
    }

    if (stored.expiresAt < new Date()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
      return c.json({ error: "Refresh token expired" }, 401);
    }

    // Token rotation: delete old, create new
    await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

    const userRows = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);

    const user = userRows[0];
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    const newTokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await db.insert(refreshTokens).values({
      id: newTokenId,
      userId: user.id,
      expiresAt,
    });

    const accessToken = await signAccessToken(user.id, user.username, user.role);
    const newRefreshToken = await signRefreshToken(newTokenId, user.id);

    setCookie(c, REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/api/v1/auth",
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });

    return c.json({ accessToken, refreshToken: newRefreshToken });
  });

  router.post("/logout", async (c) => {
    const body = await c.req.json().catch(() => null);
    const rawToken =
      (body?.refreshToken as string | undefined) ?? getCookie(c, REFRESH_COOKIE_NAME);

    deleteCookie(c, REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });

    if (!rawToken) {
      return c.json({ error: "Missing refresh token" }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verify(rawToken, getJwtSecret(), "HS256");
    } catch {
      // Token invalid but still return success to avoid information leakage
      return c.json({ message: "Logged out" });
    }

    if (typeof payload.jti === "string") {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
    }

    return c.json({ message: "Logged out" });
  });

  // GET /setup-status — unauthenticated, returns whether first-time setup is needed
  router.get("/setup-status", async (c) => {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    return c.json({ setupComplete: existing.length > 0 });
  });

  // POST /setup — unauthenticated, creates the first admin account
  // Returns 409 if users already exist (setup already done)
  router.post(
    "/setup",
    validate(
      "json",
      z.object({
        username: z.string().min(1).max(64),
        password: z.string().min(8),
        displayName: z.string().min(1).max(128),
      })
    ),
    async (c) => {
      const existing = await db.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) {
        return c.json({ error: "Setup already complete" }, 409);
      }

      const { username, password, displayName } = c.req.valid("json");
      const email = `${username}@localhost`;
      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        username,
        email,
        displayName,
        passwordHash,
        role: "admin",
      });

      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
      await db.insert(refreshTokens).values({ id: tokenId, userId, expiresAt });

      const accessToken = await signAccessToken(userId, username, "admin");
      const refreshToken = await signRefreshToken(tokenId, userId);

      setCookie(c, REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/api/v1/auth",
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      });

      return c.json({ accessToken, refreshToken }, 201);
    }
  );

  return router;
}
