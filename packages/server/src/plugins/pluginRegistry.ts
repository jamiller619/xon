export function createPluginRegistry<T>() {
  const registry = new Map<string, T>()

  return {
    getPlugin(pluginId: string): T | undefined {
      return registry.get(pluginId)
    },

    registerPlugin(pluginId: string, plugin: T): void {
      registry.set(pluginId, plugin)
    },

    unregisterPlugin(pluginId: string): void {
      registry.delete(pluginId)
    },
  }
}
