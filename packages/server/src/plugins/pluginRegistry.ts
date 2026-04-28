export function createPluginRegistry<T>() {
  const registry = new Map<string, T>()

  return {
    setPlugin(pluginId: string, plugin: T): void {
      registry.set(pluginId, plugin)
    },

    getPlugin(pluginId: string): T | undefined {
      return registry.get(pluginId)
    },

    unregisterPlugin(pluginId: string): void {
      registry.delete(pluginId)
    },
  }
}
