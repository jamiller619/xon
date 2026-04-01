import type { PluginContext, PluginManifest } from './types.js'

/**
 * Base class for all Xon plugins.
 * Plugin authors should extend this class and override lifecycle methods.
 */
export abstract class BasePlugin {
  abstract readonly manifest: PluginManifest

  /**
   * Called once when the plugin is first loaded.
   * Use for one-time setup like registering routes and event hooks.
   */
  async init(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is activated (enabled by the user).
   * Use for starting background tasks or making the plugin operational.
   */
  async activate(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is deactivated (disabled by the user).
   * Registered hooks and routes are automatically cleaned up by the plugin manager.
   * Override to stop any background tasks started in activate().
   */
  async deactivate(): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is uninstalled.
   * Called after deactivate(). Use to clean up any persistent data.
   */
  async uninstall(): Promise<void> {
    // Default: no-op
  }
}
