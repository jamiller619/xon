import type { MediaProviderPlugin } from "@xon/plugin-sdk";

/** Registry mapping pluginId → MediaProviderPlugin instance */
const registry = new Map<string, MediaProviderPlugin>();

/**
 * Register a MediaProviderPlugin instance under the given pluginId.
 * Typically called when the plugin is activated.
 */
export function registerMediaProviderPlugin(pluginId: string, plugin: MediaProviderPlugin): void {
  registry.set(pluginId, plugin);
}

/**
 * Look up a registered MediaProviderPlugin by pluginId.
 * Returns undefined if no plugin is registered for the given id.
 */
export function getMediaProviderPlugin(pluginId: string): MediaProviderPlugin | undefined {
  return registry.get(pluginId);
}

/** Unregister a MediaProviderPlugin — called when the plugin is deactivated. */
export function unregisterMediaProviderPlugin(pluginId: string): void {
  registry.delete(pluginId);
}

/** Reset the registry — use only in tests. */
export function _resetMediaProviderPluginRegistry(): void {
  registry.clear();
}
