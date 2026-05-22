import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

loadEnvFile('./.env')

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
