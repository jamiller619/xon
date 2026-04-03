import type { MetadataSourcePlugin } from '@xon/plugin-sdk'

/** Registry mapping pluginId → MetadataSourcePlugin instance */
const registry = new Map<string, MetadataSourcePlugin>()

/**
 * Register a MetadataSourcePlugin instance under the given pluginId.
 * Typically called when the plugin is activated.
 */
export function registerMetadataSourcePlugin(
  pluginId: string,
  plugin: MetadataSourcePlugin,
): void {
  registry.set(pluginId, plugin)
}

/**
 * Look up a registered MetadataSourcePlugin by pluginId.
 * Returns undefined if no plugin is registered for the given id.
 */
export function getMetadataSourcePlugin(
  pluginId: string,
): MetadataSourcePlugin | undefined {
  return registry.get(pluginId)
}

/** Returns all registered MetadataSourcePlugin instances. */
export function getAllMetadataSourcePlugins(): MetadataSourcePlugin[] {
  return Array.from(registry.values())
}

/** Unregister a MetadataSourcePlugin — called when the plugin is deactivated. */
export function unregisterMetadataSourcePlugin(pluginId: string): void {
  registry.delete(pluginId)
}

/** Reset the registry — use only in tests. */
export function _resetMetadataSourcePluginRegistry(): void {
  registry.clear()
}
