import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const dataDir = process.env.DATA_DIR ?? './data';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: `file:${join(dataDir, 'xon.db')}`,
  },
});
