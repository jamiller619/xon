import { type ConfigKey, schema } from '@xon/shared'

type JsonSchemaProperty = {
  type?: string
  title?: string
  description?: string
  readOnly?: boolean
  default?: unknown
  enum?: unknown[]
  minimum?: number
  maximum?: number
  items?: { type?: string }
}

type SettingsJsonSchema = {
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  'x-xon-ui'?: {
    categories?: Array<{ namespace: string; title: string }>
  }
}

export type SettingControlType =
  | 'boolean'
  | 'enum'
  | 'integer'
  | 'number'
  | 'string'
  | 'string-list'
  | 'unsupported'

export type SettingDefinition = {
  key: ConfigKey
  namespace: string
  categoryTitle: string
  subgroupTitle?: string
  title: string
  description?: string
  control: SettingControlType
  required: boolean
  readOnly: boolean
  defaultValue?: unknown
  enumValues?: string[]
  minimum?: number
  maximum?: number
}

export type SettingsCategory = {
  namespace: string
  title: string
  settings: SettingDefinition[]
}

const source = schema as SettingsJsonSchema

function humanize(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function getControl(property: JsonSchemaProperty): SettingControlType {
  if (
    property.type === 'string' &&
    property.enum?.every((value) => typeof value === 'string')
  ) {
    return 'enum'
  }
  if (property.type === 'string') return 'string'
  if (property.type === 'integer') return 'integer'
  if (property.type === 'number') return 'number'
  if (property.type === 'boolean') return 'boolean'
  if (property.type === 'array' && property.items?.type === 'string') {
    return 'string-list'
  }
  return 'unsupported'
}

export function createSettingsCatalog(
  jsonSchema: SettingsJsonSchema = source,
): SettingsCategory[] {
  const properties = jsonSchema.properties ?? {}
  const required = new Set(jsonSchema.required ?? [])
  const categoryTitles = new Map(
    jsonSchema['x-xon-ui']?.categories?.map(({ namespace, title }) => [
      namespace,
      title,
    ]) ?? [],
  )
  const categories = new Map<string, SettingsCategory>()

  for (const [rawKey, property] of Object.entries(properties)) {
    const key = rawKey as ConfigKey
    const segments = rawKey.split('.')
    const namespace = segments[0] ?? rawKey
    const subgroup = segments.length > 2 ? segments.slice(1, -1).join(' ') : ''
    const categoryTitle = categoryTitles.get(namespace) ?? humanize(namespace)
    let category = categories.get(namespace)

    if (!category) {
      category = { namespace, title: categoryTitle, settings: [] }
      categories.set(namespace, category)
    }

    category.settings.push({
      key,
      namespace,
      categoryTitle,
      ...(subgroup ? { subgroupTitle: humanize(subgroup) } : {}),
      title: property.title ?? humanize(segments.at(-1) ?? rawKey),
      ...(property.description ? { description: property.description } : {}),
      control: getControl(property),
      required: required.has(rawKey),
      readOnly: property.readOnly === true,
      ...('default' in property ? { defaultValue: property.default } : {}),
      ...(property.enum?.every((value) => typeof value === 'string')
        ? { enumValues: property.enum as string[] }
        : {}),
      ...(property.minimum === undefined ? {} : { minimum: property.minimum }),
      ...(property.maximum === undefined ? {} : { maximum: property.maximum }),
    })
  }

  return [...categories.values()]
}

export const settingsCatalog = createSettingsCatalog()

export function settingMatchesQuery(
  setting: SettingDefinition,
  rawQuery: string,
) {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return true

  return [
    setting.key,
    setting.title,
    setting.description,
    setting.categoryTitle,
    setting.subgroupTitle,
    setting.enumValues?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(query)
}

export function validateSettingValue(
  setting: SettingDefinition,
  value: unknown,
): string | undefined {
  if (setting.control === 'integer' || setting.control === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Enter a valid number.'
    }
    if (setting.control === 'integer' && !Number.isInteger(value)) {
      return 'Enter a whole number.'
    }
    if (setting.minimum !== undefined && value < setting.minimum) {
      return `Enter ${setting.minimum} or greater.`
    }
    if (setting.maximum !== undefined && value > setting.maximum) {
      return `Enter ${setting.maximum} or less.`
    }
  }

  if (
    setting.control === 'string-list' &&
    (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
  ) {
    return 'Every value must be text.'
  }

  if (
    setting.control === 'enum' &&
    (typeof value !== 'string' || !setting.enumValues?.includes(value))
  ) {
    return 'Choose one of the available values.'
  }

  return undefined
}
