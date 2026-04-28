import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const serverSettings = sqliteTable('server_settings', {
  id: text('id').primaryKey(),
  corsEnabled: integer('cors_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  corsAllowedOrigins: text('cors_allowed_origins').notNull().default('["*"]'),
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  rateLimitGeneral: integer('rate_limit_general').notNull().default(100),
  rateLimitAuth: integer('rate_limit_auth').notNull().default(10),
  httpsEnabled: integer('https_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  httpsCertPath: text('https_cert_path'),
  httpsKeyPath: text('https_key_path'),
  acmeEnabled: integer('acme_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  acmeDomain: text('acme_domain'),
  acmeEmail: text('acme_email'),
  acmeCertsDir: text('acme_certs_dir'),
  trustProxy: integer('trust_proxy', { mode: 'boolean' })
    .notNull()
    .default(false),
  serverPort: integer('server_port').notNull().default(32400),
  dataDirectory: text('data_directory').notNull().default('./data'),
  defaultScanSchedule: text('default_scan_schedule'),
  thumbnailSizes: text('thumbnail_sizes')
    .notNull()
    .default('["small","medium"]'),
  logLevel: text('log_level', { enum: ['debug', 'info', 'warn', 'error'] })
    .notNull()
    .default('info'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type ServerSettings = typeof serverSettings.$inferSelect
export type NewServerSettings = typeof serverSettings.$inferInsert
