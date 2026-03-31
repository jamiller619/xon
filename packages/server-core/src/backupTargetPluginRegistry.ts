import type { BackupTargetPlugin } from '@xon/plugin-sdk';

/** Registry mapping pluginId → BackupTargetPlugin instance */
const registry = new Map<string, BackupTargetPlugin>();

/**
 * Register a BackupTargetPlugin instance under the given pluginId.
 * Typically called when the plugin is activated.
 */
export function registerBackupTargetPlugin(
  pluginId: string,
  plugin: BackupTargetPlugin,
): void {
  registry.set(pluginId, plugin);
}

/**
 * Look up a registered BackupTargetPlugin by pluginId.
 * Returns undefined if no plugin is registered for the given id.
 */
export function getBackupTargetPlugin(
  pluginId: string,
): BackupTargetPlugin | undefined {
  return registry.get(pluginId);
}

/** Unregister a BackupTargetPlugin — called when the plugin is deactivated. */
export function unregisterBackupTargetPlugin(pluginId: string): void {
  registry.delete(pluginId);
}

/** Reset the registry — use only in tests. */
export function _resetBackupTargetPluginRegistry(): void {
  registry.clear();
}
