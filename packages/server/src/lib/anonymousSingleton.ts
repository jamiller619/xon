import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { asc, eq } from 'drizzle-orm'
import config from '../config.ts'
import db from '../db/db.ts'
import { users } from '../db/schema.ts'

/**
 * Replaces better-auth's stock `anonymous` plugin, which creates a brand-new
 * user row for every cookie-less visitor. Xon treats anonymity as one shared
 * identity instead: the first anonymous sign-in ever creates the single
 * anonymous user, and every later anonymous session — any browser, any
 * device — attaches to that same user. Compatible with the stock
 * `anonymousClient()` plugin on the web side (same path, same response shape).
 *
 * The singleton is resolved as the *oldest* user flagged `isAnonymous`, so
 * databases created under the stock plugin keep the identity (and library
 * ownership) of their original anonymous user.
 */
export function anonymousSingleton(): BetterAuthPlugin {
  return {
    id: 'anonymous-singleton',
    schema: {
      user: {
        fields: {
          isAnonymous: {
            type: 'boolean',
            required: false,
          },
        },
      },
    },
    endpoints: {
      signInAnonymous: createAuthEndpoint(
        '/sign-in/anonymous',
        { method: 'POST' },
        async (ctx) => {
          if (!config.get('session.enableAnonymousLogins')) {
            throw new APIError('FORBIDDEN', {
              message: 'Anonymous logins are disabled',
            })
          }

          let [user] = await db
            .select()
            .from(users)
            .where(eq(users.isAnonymous, true))
            .orderBy(asc(users.createdAt))
            .limit(1)

          if (!user) {
            try {
              await ctx.context.internalAdapter.createUser({
                email: 'anonymous@xon.local',
                emailVerified: false,
                isAnonymous: true,
                name: 'Guest',
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            } catch {
              // A concurrent first sign-in may have just created it — the
              // re-select below settles the race either way
            }
            ;[user] = await db
              .select()
              .from(users)
              .where(eq(users.isAnonymous, true))
              .orderBy(asc(users.createdAt))
              .limit(1)
          }

          if (!user) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Failed to create anonymous user',
            })
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          )

          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Could not create session',
            })
          }

          await setSessionCookie(ctx, { session, user })

          return ctx.json({ token: session.token, user })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
