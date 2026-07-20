/**
 * The app config store key under which a plugin setting is saved.
 * Shared by the server (reads/seeds values) and the settings UI (saves them).
 */
export function pluginSettingKey(pluginId: string, key: string): string {
  return `plugins.${pluginId}.${key}`
}
