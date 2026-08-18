import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import config from '../config.ts'
import db from '../db/db.ts'
import * as schema from '../db/schema.ts'
import { sessionClientNameFromHeaders } from '../services/sessionClient.ts'
import * as userService from '../services/userService.ts'
import { anonymousSingleton } from './anonymousSingleton.ts'

export default betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    usePlural: true,
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await userService.onUserCreate(db, user.id)
        },
      },
    },
    session: {
      create: {
        before(session, context) {
          const clientName = sessionClientNameFromHeaders(context?.headers)
          if (!clientName) return Promise.resolve()

          return Promise.resolve({
            data: { ...session, clientName },
          })
        },
      },
    },
  },
  session: {
    expiresIn: config.get('session.ttlDays') * 24 * 60 * 60,
    updateAge: config.get('session.updateAge') * 24 * 60 * 60,
    disableSessionRefresh: config.get('session.disableSessionRefresh'),
    additionalFields: {
      lastSeenAt: {
        type: 'date',
        input: false,
        defaultValue: () => new Date(),
      },
      clientName: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  plugins: [anonymousSingleton()],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
})
