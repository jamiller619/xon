import { UserRole } from '@xon/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins'
import { generateName } from 'namejam'
import config from '../config.ts'
import { db } from '../db/db.ts'
import * as schema from '../db/schema.ts'
import * as userService from '../services/userService.ts'

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
  },
  session: {
    expiresIn: config.get('session.ttlDays') * 24 * 60 * 60,
    updateAge: config.get('session.updateAge') * 24 * 60 * 60,
    disableSessionRefresh: config.get('session.disableSessionRefresh'),
  },
  user: {
    additionalFields: {
      role: {
        type: [UserRole.User, UserRole.Admin, UserRole.Guest],
        required: true,
        defaultValue: UserRole.User,
      },
    },
  },
  plugins: [
    anonymous({
      generateName: () => generateName(),
    }),
  ],
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
