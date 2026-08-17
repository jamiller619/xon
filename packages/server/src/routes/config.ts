import { type Config, type ConfigKey, schema } from '@xon/shared'
import { Hono, type Schema } from 'hono'
import { z } from 'zod'
import config, { type ConfigStore, configSchema } from '../config.ts'
import { type AuthenticatedEnv, requireAuth } from '../http/authMiddleware.ts'
import {
  errorCodes,
  errorResponse,
  noCacheJSON,
  type ValidationErrorDetail,
} from '../http/responses.ts'
import { validate } from '../http/validate.ts'

const configUpdateSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('set'),
      key: z.string().trim().min(1),
      value: z.json(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('unset'),
      key: z.string().trim().min(1),
    })
    .strict(),
])

type ConfigPropertySchema = {
  readOnly?: boolean
}

const configProperties = schema.properties as Record<
  string,
  ConfigPropertySchema
>
const coreConfigKeys = new Set(Object.keys(configProperties))
const requiredConfigKeys = new Set(schema.required)

export function makeConfigRouter(
  configStore: ConfigStore = config,
): Hono<AuthenticatedEnv, Schema> {
  const router = new Hono()

    .get('/bootstrap', (c) => {
      return noCacheJSON(c, {
        'session.enableAnonymousLogins': configStore.get(
          'session.enableAnonymousLogins',
        ),
      })
    })

    .use('*', requireAuth)

    .get('/', (c) => {
      return noCacheJSON(c, getCoreConfig(configStore))
    })

    .post('/', validate('json', configUpdateSchema), async (c) => {
      const body = c.req.valid('json')
      const key = body.key as ConfigKey
      const property = configProperties[key]

      if (!property) {
        return errorResponse(
          c,
          400,
          errorCodes.validation,
          `Unknown config key: ${body.key}`,
        )
      }

      if (property.readOnly) {
        return errorResponse(
          c,
          400,
          errorCodes.validation,
          `Config key is read only: ${body.key}`,
        )
      }

      if (body.operation === 'unset' && requiredConfigKeys.has(key)) {
        return errorResponse(
          c,
          400,
          errorCodes.validation,
          `Required config key cannot be unset: ${body.key}`,
        )
      }

      const candidate = getCoreConfig(configStore) as Record<string, unknown>
      if (body.operation === 'set') candidate[key] = body.value
      else delete candidate[key]

      const parsed = configSchema.safeParse(candidate)
      if (!parsed.success) {
        const details: ValidationErrorDetail[] = parsed.error.issues.map(
          ({ code, message, path }) => ({
            code,
            message,
            path: path.map((segment) =>
              typeof segment === 'symbol'
                ? (segment.description ?? segment.toString())
                : segment,
            ),
          }),
        )
        return errorResponse(
          c,
          400,
          errorCodes.validation,
          'Config value failed validation',
          details,
        )
      }

      const value =
        body.operation === 'set'
          ? (parsed.data as Partial<Config>)[key]
          : undefined
      await configStore.set(key, value)

      return noCacheJSON(c, {
        key,
        ...(value === undefined ? {} : { value }),
      })
    })

  return router
}

function getCoreConfig(configStore: ConfigStore): Partial<Config> {
  const store = configStore.getStore() as unknown as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(store).filter(([key]) => coreConfigKeys.has(key)),
  ) as Partial<Config>
}
