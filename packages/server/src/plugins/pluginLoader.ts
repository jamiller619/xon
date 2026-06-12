import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PluginManifest } from '@xon/plugin-sdk'

export type PluginLoadResult =
  | { success: true; pluginDir: string; manifest: PluginManifest }
  | { success: false; pluginDir: string; error: string }

const VALID_CATEGORIES = new Set([
  'MediaProvider',
  'MetadataSource',
  'FormatHandler',
  'Processor',
  'Theme',
  'UIExtension',
  'BackupTarget',
])

function validateManifest(data: unknown, source: string): PluginManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`${source}: manifest must be an object`)
  }

  const resp = {} as PluginManifest

  // @ts-expect-error: this works
  const id = data.id ?? data.xon?.id ?? data.name

  if (typeof id !== 'string' || (id as string).trim() === '') {
    throw new Error(`${source}: missing or invalid id field`)
  }

  resp.id = id

  const required: Array<keyof PluginManifest> = [
    'name',
    'version',
    'description',
    'author',
    'mediaTypes',
    'main',
    'category',
  ]

  const optional: Array<keyof PluginManifest> = [
    'displayName',
    'minServerVersion',
    'themeAssets',
    'permissions',
  ]

  for (const field of required) {
    const value =
      (data as Record<string, unknown>)[field] ??
      ('xon' in data && (data.xon as Record<string, unknown>)[field])

    if (
      !Array.isArray(value) &&
      (typeof value !== 'string' || (value as string).trim() === '')
    ) {
      throw new Error(`${source}: missing or invalid required field "${field}"`)
    }

    // @ts-expect-error: this works
    resp[field] = value
  }

  for (const field of optional) {
    const value =
      (data as Record<string, unknown>)[field] ??
      ('xon' in data && (data.xon as Record<string, unknown>)[field])

    if (value != null) {
      // @ts-expect-error: this works
      resp[field] = value
    }
  }

  if (!VALID_CATEGORIES.has(resp.category as string)) {
    throw new Error(
      `${source}: invalid category "${resp.category}". Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
    )
  }

  if (resp.mediaTypes !== undefined && !Array.isArray(resp.mediaTypes)) {
    throw new Error(`${source}: "mediaCategories" must be an array`)
  }
  if (
    resp.minServerVersion !== undefined &&
    typeof resp.minServerVersion !== 'string'
  ) {
    throw new Error(`${source}: "minServerVersion" must be a string`)
  }
  if (resp.main !== undefined && typeof resp.main !== 'string') {
    throw new Error(`${source}: "main" must be a string`)
  }

  return resp as unknown as PluginManifest
}

async function loadManifestFromDir(pluginDir: string): Promise<PluginManifest> {
  // 1. Try package.json xon field
  const pkgPath = join(pluginDir, 'package.json')
  try {
    const raw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as Record<string, unknown>

    return validateManifest(pkg, `${pluginDir}/package.json`)
  } catch (err) {
    // package.json missing or not valid JSON — fall through to next option
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      const parseError =
        err instanceof SyntaxError ||
        !(err instanceof Error && (err as NodeJS.ErrnoException).code)
      if (parseError) throw err
    }
  }

  // 2. Try xon.config.json
  const jsonConfigPath = join(pluginDir, 'xon.config.json')
  try {
    const raw = await readFile(jsonConfigPath, 'utf-8')
    const config = JSON.parse(raw) as unknown
    return validateManifest(config, `${pluginDir}/xon.config.json`)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }

  // 3. Try xon.config.ts (dynamic import — works in vitest/tsx environments)
  const tsConfigPath = join(pluginDir, 'xon.config.ts')
  try {
    const mod = await import(tsConfigPath)
    const config: unknown = (mod as Record<string, unknown>).default ?? mod
    return validateManifest(config, `${pluginDir}/xon.config.ts`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNotFound =
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      msg.includes('Cannot find module') ||
      msg.includes('Does the file exist') ||
      msg.includes('Failed to load url')
    if (!isNotFound) {
      throw err
    }
  }

  throw new Error(
    `No plugin manifest found in ${pluginDir} (tried package.json, xon.config.json, xon.config.ts)`,
  )
}

/**
 * Discover all plugin manifests under pluginDir.
 * Each immediate subdirectory is treated as a potential plugin.
 * Returns a result for each discovered subdirectory indicating success or failure.
 */
export async function discoverPluginManifests(
  pluginDir: string,
): Promise<PluginLoadResult[]> {
  let entries: Dirent[]
  try {
    entries = (await readdir(pluginDir, { withFileTypes: true })) as Dirent[]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw err
  }

  const results: PluginLoadResult[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(pluginDir, entry.name)
    try {
      const manifest = await loadManifestFromDir(dir)
      results.push({ success: true, pluginDir: dir, manifest })
    } catch (err) {
      results.push({
        success: false,
        pluginDir: dir,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
