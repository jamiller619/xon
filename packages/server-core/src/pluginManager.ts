import { basename, join } from "node:path";
import type { Client } from "@libsql/client";
import { BasePlugin } from "@xon/plugin-sdk";
import type {
  PluginContext,
  PluginEvent,
  PluginEventPayloads,
  PluginManifest,
  RouteDefinition,
  UIComponent,
} from "@xon/plugin-sdk";
import { createPluginDatabaseAccess } from "./pluginDb.js";
import { discoverPluginManifests } from "./pluginLoader.js";

type AnyPluginEventHandler = (payload: unknown) => void | Promise<void>;

interface PluginHookEntry {
  event: PluginEvent;
  handler: AnyPluginEventHandler;
}

export type PluginStatus = "loaded" | "active" | "inactive";

export interface PluginEntry {
  manifest: PluginManifest;
  pluginDir: string;
  instance: BasePlugin;
  status: PluginStatus;
  hooks: PluginHookEntry[];
  routes: RouteDefinition[];
  uiComponents: UIComponent[];
}

/** Registry of all loaded plugins, keyed by plugin id */
export const registry = new Map<string, PluginEntry>();

export interface PluginErrorEntry {
  pluginDir: string;
  manifest?: PluginManifest;
  error: string;
}

/** Plugins that failed to load or activate, keyed by plugin id or dir basename */
export const pluginErrors = new Map<string, PluginErrorEntry>();

/** Per-event handler sets for plugin event hooks */
const pluginEventHandlers = new Map<PluginEvent, Set<AnyPluginEventHandler>>();

/** Optional raw libSQL client for scoped plugin database access */
let _pluginClient: Client | undefined;

/**
 * Set the libSQL client to be used for plugin database access.
 * Must be called before activating plugins that need database access.
 */
export function setPluginDatabase(client: Client): void {
  _pluginClient = client;
}

/** Emit a plugin event to all registered hooks. Errors in hooks are logged, not thrown. */
export function emitPluginEvent<E extends PluginEvent>(
  event: E,
  payload: PluginEventPayloads[E]
): void {
  const handlers = pluginEventHandlers.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    Promise.resolve(handler(payload)).catch((err: unknown) => {
      console.error(`[plugin-manager] Hook error on "${event}":`, err);
    });
  }
}

function buildContext(entry: PluginEntry): PluginContext {
  const db = _pluginClient
    ? createPluginDatabaseAccess(entry.manifest.id, _pluginClient)
    : {
        query: async (_sql: string, _params?: unknown[]) => [],
      };

  return {
    manifest: entry.manifest,
    db,
    on<E extends PluginEvent>(
      event: E,
      handler: (payload: PluginEventPayloads[E]) => void | Promise<void>
    ): void {
      const anyHandler = handler as AnyPluginEventHandler;
      entry.hooks.push({ event, handler: anyHandler });
      let set = pluginEventHandlers.get(event);
      if (!set) {
        set = new Set();
        pluginEventHandlers.set(event, set);
      }
      set.add(anyHandler);
    },
    registerRoute(route: RouteDefinition): void {
      entry.routes.push(route);
    },
    registerUI(component: UIComponent): void {
      entry.uiComponents.push(component);
    },
    logger: {
      info: (msg: string) => console.log(`[plugin:${entry.manifest.id}] ${msg}`),
      warn: (msg: string) => console.warn(`[plugin:${entry.manifest.id}] ${msg}`),
      error: (msg: string) => console.error(`[plugin:${entry.manifest.id}] ${msg}`),
    },
  };
}

function cleanupHooksAndRoutes(entry: PluginEntry): void {
  for (const { event, handler } of entry.hooks) {
    const set = pluginEventHandlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) pluginEventHandlers.delete(event);
    }
  }
  entry.hooks = [];
  entry.routes = [];
  entry.uiComponents = [];
}

/**
 * Dynamically import a plugin module from its directory and instantiate the plugin class.
 * The module must export a default that is a subclass of BasePlugin,
 * or export a named class that is a subclass of BasePlugin.
 */
export async function loadPlugin(
  pluginDir: string,
  manifest: PluginManifest
): Promise<PluginEntry> {
  const mainFile = manifest.main ?? "index.js";
  const modulePath = join(pluginDir, mainFile);

  let mod: unknown;
  try {
    mod = await import(modulePath);
  } catch (err) {
    throw new Error(
      `Failed to import plugin module "${modulePath}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const exports = mod as Record<string, unknown>;
  let PluginClass: (new () => BasePlugin) | undefined;

  // Prefer default export
  if (typeof exports.default === "function" && exports.default.prototype instanceof BasePlugin) {
    PluginClass = exports.default as new () => BasePlugin;
  } else {
    // Fall back to first named export that's a BasePlugin subclass
    for (const key of Object.keys(exports)) {
      const val = exports[key];
      if (typeof val === "function" && val.prototype instanceof BasePlugin) {
        PluginClass = val as new () => BasePlugin;
        break;
      }
    }
  }

  if (!PluginClass) {
    throw new Error(`Plugin module "${modulePath}" does not export a BasePlugin subclass`);
  }

  let instance: BasePlugin;
  try {
    instance = new PluginClass();
  } catch (err) {
    throw new Error(
      `Failed to instantiate plugin "${manifest.id}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return _registerPlugin({
    manifest,
    pluginDir,
    instance,
    status: "loaded",
    hooks: [],
    routes: [],
    uiComponents: [],
  });
}

/**
 * Insert a plugin entry directly into the registry.
 * Exposed for testing without file system access.
 */
export function _registerPlugin(entry: PluginEntry): PluginEntry {
  registry.set(entry.manifest.id, entry);
  return entry;
}

/**
 * Activate a loaded plugin: call init() then activate() with a scoped context.
 * Throws if the plugin is not in the registry.
 */
export async function activatePlugin(pluginId: string): Promise<void> {
  const entry = registry.get(pluginId);
  if (!entry) throw new Error(`Plugin "${pluginId}" not found in registry`);
  if (entry.status === "active") return;

  const context = buildContext(entry);
  await entry.instance.init(context);
  await entry.instance.activate(context);
  entry.status = "active";
}

/**
 * Deactivate an active plugin: call deactivate() and clean up registered hooks and routes.
 * No-op if the plugin is not active.
 */
export async function deactivatePlugin(pluginId: string): Promise<void> {
  const entry = registry.get(pluginId);
  if (!entry) throw new Error(`Plugin "${pluginId}" not found in registry`);
  if (entry.status !== "active") return;

  await entry.instance.deactivate();
  cleanupHooksAndRoutes(entry);
  entry.status = "inactive";
}

/**
 * Uninstall a plugin: deactivate if active, call uninstall(), then remove from registry.
 */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  const entry = registry.get(pluginId);
  if (!entry) throw new Error(`Plugin "${pluginId}" not found in registry`);

  if (entry.status === "active") {
    await deactivatePlugin(pluginId);
  }

  await entry.instance.uninstall();
  registry.delete(pluginId);
}

/**
 * Discover all plugin manifests in pluginDir, load, and activate each one.
 * Errors in individual plugins are logged and do not prevent other plugins from loading.
 */
export async function discoverAndActivatePlugins(pluginDir: string): Promise<void> {
  const results = await discoverPluginManifests(pluginDir);

  for (const result of results) {
    if (!result.success) {
      console.error(`[plugin-manager] Skipping plugin at ${result.pluginDir}: ${result.error}`);
      const fallbackId = basename(result.pluginDir);
      pluginErrors.set(fallbackId, { pluginDir: result.pluginDir, error: result.error });
      continue;
    }

    const { manifest, pluginDir: dir } = result;

    try {
      await loadPlugin(dir, manifest);
      await activatePlugin(manifest.id);
      console.log(`[plugin-manager] Activated plugin: ${manifest.id} (${manifest.name})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[plugin-manager] Failed to activate plugin "${manifest.id}": ${errorMsg}`);
      pluginErrors.set(manifest.id, { pluginDir: dir, manifest, error: errorMsg });
    }
  }
}

/** Reset all internal state — use only in tests */
export function _resetForTesting(): void {
  registry.clear();
  pluginEventHandlers.clear();
  pluginErrors.clear();
  _pluginClient = undefined;
}
