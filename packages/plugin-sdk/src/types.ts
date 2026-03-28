import type { MediaCategory } from "@xon/shared";

// Plugin category types
export type PluginCategory =
  | "MediaProvider"
  | "MetadataSource"
  | "FormatHandler"
  | "Processor"
  | "Theme"
  | "UIExtension"
  | "BackupTarget";

// Plugin manifest matching the package.json xon field schema
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: PluginCategory;
  /** Media categories this plugin handles (for MediaProvider/FormatHandler) */
  mediaCategories?: MediaCategory[];
  /** Minimum Xon server version required */
  minServerVersion?: string;
  /** Entry point relative to plugin root (default: index.js) */
  main?: string;
  /** Theme asset files (for Theme category plugins) */
  themeAssets?: {
    /** CSS file path relative to plugin assets directory */
    cssFile?: string;
    /** Optional JavaScript file path relative to plugin assets directory */
    jsFile?: string;
  };
}

// Event types for plugin event hooks
export type PluginEvent =
  | "scan:start"
  | "scan:complete"
  | "media:created"
  | "media:updated"
  | "media:deleted"
  | "server:boot"
  | "server:shutdown";

export interface PluginEventPayloads {
  "scan:start": { libraryId: string };
  "scan:complete": { libraryId: string; itemsFound: number };
  "media:created": { mediaId: string; filePath: string };
  "media:updated": { mediaId: string; filePath: string };
  "media:deleted": { mediaId: string; filePath: string };
  "server:boot": Record<string, never>;
  "server:shutdown": Record<string, never>;
}

// Minimal Hono-compatible route handler context (avoids DOM type dependency)
export interface PluginRouteContext {
  req: {
    param: (key: string) => string;
    query: (key: string) => string | undefined;
    json: <T = unknown>() => Promise<T>;
    header: (key: string) => string | undefined;
  };
  json: (data: unknown, status?: number) => PluginRouteResponse;
  text: (text: string, status?: number) => PluginRouteResponse;
}

export interface PluginRouteResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
}

// Route handler type (Hono-compatible)
export type RouteHandler = (
  c: PluginRouteContext
) => PluginRouteResponse | Promise<PluginRouteResponse>;

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: RouteHandler;
}

// UI injection point types
export type UIInjectionPoint =
  | "dashboard-widget"
  | "detail-panel"
  | "admin-page"
  | "nav-item"
  | "sidebar:top"
  | "sidebar:bottom"
  | "mediaDetail:actions"
  | "library:toolbar"
  | "settings:page";

export interface UIComponent {
  id: string;
  injectionPoint: UIInjectionPoint;
  /** Client-side JS bundle URL served by the plugin */
  bundleUrl: string;
  /** Display label shown in nav or admin contexts */
  label?: string;
}

/** Props passed to plugin UI components at render time */
export interface PluginComponentProps {
  mediaItem?: {
    id: string;
    title: string | null;
    mediaCategory: string | null;
    libraryId: string | null;
  };
  libraryId?: string;
}

// Database access interface exposed to plugins
export interface PluginDatabaseAccess {
  /** Execute a raw SQL query (read-only) */
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
}

// Plugin context provided to lifecycle methods
export interface PluginContext {
  /** Plugin's own manifest */
  manifest: PluginManifest;
  /** Scoped database access */
  db: PluginDatabaseAccess;
  /** Register an event hook */
  on: <E extends PluginEvent>(
    event: E,
    handler: (payload: PluginEventPayloads[E]) => void | Promise<void>
  ) => void;
  /** Register an API route under /api/v1/plugins/:pluginId/ */
  registerRoute: (route: RouteDefinition) => void;
  /** Register a UI component injection */
  registerUI: (component: UIComponent) => void;
  /** Logger scoped to this plugin */
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}
