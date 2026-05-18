import { join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { defineConfig } from 'drizzle-kit'

loadEnvFile()

const dataDir = process.env.DATA_DIR ?? './.data'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: `file:${join(dataDir, 'xon.db')}`,
  },
})
