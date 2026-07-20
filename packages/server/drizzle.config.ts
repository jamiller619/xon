import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

// The project's only .env file lives at apps/headless/.env (see
// src/config.ts), not here — drizzle-kit runs with cwd=packages/server, so
// there's no local .env to load. Fall back to DATABASE_URL already present
// in the environment (top-level await isn't supported by drizzle-kit's
// config transform, so we can't findUp() the way config.ts does).
try {
  loadEnvFile('./.env')
} catch {
  // no local .env — DATABASE_URL must already be set in the environment
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

fsp.mkdir(path.dirname(fileURLToPath(process.env.DATABASE_URL)), {
  recursive: true,
})

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
