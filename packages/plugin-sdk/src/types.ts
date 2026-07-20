import type { LibraryType, MediaType, PluginCategory } from '@xon/shared'

/**
 * JSON-schema-style definition of a single plugin setting. Declared in the
 * manifest, rendered and saved by the app's settings UI, and read by the
 * plugin via `PluginContext.settings`.
 */
export interface PluginSettingDefinition {
  title: string
  type: 'string' | 'number' | 'integer' | 'boolean'
  description?: string
  default?: string | number | boolean
  enum?: (string | number)[]
  /** Mask the value in the settings UI (API keys, tokens) */
  secret?: boolean
}

// Plugin manifest matching the package.json xon field schema
export interface PluginManifest {
  id: string
  name: string
  displayName?: string
  version: string
  description: string
  author: string
  category: PluginCategory
  /** Library types this plugin handles */
  libraryTypes: (LibraryType | string)[]
  /** Media types this plugin handles */
  mediaTypes?: (MediaType | string)[]
  /** Minimum Xon server version required */
  minServerVersion?: string
  /**
   * Run order among plugins of the same category — lower runs first
   * (default 0). Later plugins see metadata from earlier ones (e.g.
   * OMDb reusing TMDb's imdbId) and overwrite any fields they both
   * produce, so the highest-priority source wins.
   */
  priority?: number
  /**
   * Settings this plugin exposes in the app's settings UI, keyed by
   * setting name. Values are stored in the app config under
   * `plugins.<pluginId>.<key>` and read via `PluginContext.settings`.
   */
  settings?: Record<string, PluginSettingDefinition>
  /** Entry point relative to plugin root (default: index.js) */
  main?: string
  /** Theme asset files (for Theme category plugins) */
  themeAssets?: {
    /** CSS file path relative to plugin assets directory */
    cssFile?: string
    /** Optional JavaScript file path relative to plugin assets directory */
    jsFile?: string
  }
  /** Declared sandbox permissions for this plugin */
  permissions?: {
    /** Network domains the plugin may connect to (e.g. "api.example.com") */
    network?: string[]
  }
}

// Event types for plugin event hooks
export type PluginEvent =
  | 'scan:start'
  | 'scan:complete'
  | 'media:created'
  | 'media:updated'
  | 'media:deleted'
  | 'server:boot'
  | 'server:shutdown'

export interface PluginEventPayloads {
  'scan:start': { libraryId: string }
  'scan:complete': { libraryId: string; itemsFound: number }
  'media:created': {
    mediaId: string
    filePath: string
    mediaType: MediaType
    libraryId: string
  }
  'media:updated': {
    mediaId: string
    filePath: string
    mediaType: MediaType
    libraryId: string
  }
  'media:deleted': {
    mediaId: string
    filePath: string
    mediaType: MediaType
    libraryId: string
  }
  'server:boot': Record<string, never>
  'server:shutdown': Record<string, never>
}

// Minimal Hono-compatible route handler context (avoids DOM type dependency)
export interface PluginRouteContext {
  req: {
    param: (key: string) => string
    query: (key: string) => string | undefined
    json: <T = unknown>() => Promise<T>
    header: (key: string) => string | undefined
  }
  json: (data: unknown, status?: number) => PluginRouteResponse
  text: (text: string, status?: number) => PluginRouteResponse
}

export interface PluginRouteResponse {
  readonly status: number
  readonly headers: Record<string, string>
}

// Route handler type (Hono-compatible)
export type RouteHandler = (
  c: PluginRouteContext,
) => PluginRouteResponse | Promise<PluginRouteResponse>

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  handler: RouteHandler
}

// UI injection point types
export type UIInjectionPoint =
  | 'dashboard-widget'
  | 'detail-panel'
  | 'admin-page'
  | 'nav-item'
  | 'sidebar:top'
  | 'sidebar:bottom'
  | 'mediaDetail:actions'
  | 'library:toolbar'
  | 'settings:page'

export interface UIComponent {
  id: string
  injectionPoint: UIInjectionPoint
  /** Client-side JS bundle URL served by the plugin */
  bundleUrl: string
  /** Display label shown in nav or admin contexts */
  label?: string
}

/** Props passed to plugin UI components at render time */
export interface PluginComponentProps {
  mediaItem?: {
    id: string
    title: string | null
    mediaCategory: string | null
    libraryId: string | null
  }
  libraryId?: string
}

// ---------------------------------------------------------------------------
// BackupTarget plugin types
// ---------------------------------------------------------------------------

/** A single configuration field for a BackupTarget plugin's admin UI form */
export interface BackupTargetConfigField {
  /** Key used in the plugin config JSON */
  key: string
  /** Human-readable label shown in the admin UI */
  label: string
  /** Input type for the admin UI */
  type: 'string' | 'password' | 'number' | 'boolean'
  /** Whether this field must be filled before saving */
  required?: boolean
  /** Default value pre-populated in the admin UI */
  default?: string | number | boolean
  /** Optional help text shown below the field */
  description?: string
}

/** Schema describing all configuration fields for a BackupTarget plugin */
export interface BackupTargetConfigSchema {
  fields: BackupTargetConfigField[]
}

/** Result returned by BackupTargetPlugin.verify() */
export interface BackupVerifyResult {
  /** Whether the file exists in remote storage */
  exists: boolean
  /** SHA-256 checksum of the remote file, if available */
  checksum?: string
  /** Size of the remote file in bytes, if available */
  size?: number
}

// ---------------------------------------------------------------------------
// MediaProvider plugin types
// ---------------------------------------------------------------------------

/** A file entry returned by a MediaProvider plugin's listFiles() method */
export interface MediaProviderFile {
  /** Unique identifier for the file in the remote storage */
  id: string
  /** Display name of the file */
  name: string
  /** Full path or virtual path of the file in the remote storage */
  path: string
  /** File size in bytes */
  size: number
  /** MIME type of the file */
  mediaType: string
  /** Last modified timestamp */
  modifiedAt?: Date | undefined
  /** Creation timestamp */
  createdAt?: Date | undefined
}

/** Callback invoked by MediaProviderPlugin.watch() when files change */
export type WatchCallback = (event: {
  type: 'created' | 'updated' | 'deleted'
  file: MediaProviderFile
}) => void

/** A single configuration field for a MediaProvider plugin's data source setup form */
export interface MediaProviderConfigField {
  /** Key used in the plugin config JSON */
  key: string
  /** Human-readable label shown in the admin UI */
  label: string
  /** Input type for the admin UI */
  type: 'string' | 'password' | 'number' | 'boolean'
  /** Whether this field must be filled before saving */
  required?: boolean
  /** Default value pre-populated in the admin UI */
  default?: string | number | boolean
  /** Optional help text shown below the field */
  description?: string
}

/** Schema describing all configuration fields for a MediaProvider plugin */
export interface MediaProviderConfigSchema {
  fields: MediaProviderConfigField[]
}

// Database access interface exposed to plugins
export interface PluginDatabaseAccess {
  /** Execute a raw SQL query (read-only) */
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>
}

// Plugin context provided to lifecycle methods
export interface PluginContext {
  /** Plugin's own manifest */
  manifest: PluginManifest
  /** Scoped database access */
  // db: PluginDatabaseAccess
  /** Register an event hook */
  on: <E extends PluginEvent>(
    event: E,
    handler: (payload: PluginEventPayloads[E]) => void | Promise<void>,
  ) => void
  /** Register an API route under /api/plugins/:pluginId/ */
  registerRoute: (route: RouteDefinition) => void
  /** Register a UI component injection */
  registerUI: (component: UIComponent) => void
  /**
   * Register a media metadata provider.
   * Called when a media item is fetched via the API; the returned object is
   * merged into the response under `pluginMetadata[pluginId]`.
   */
  registerMediaMetadataProvider: (
    provider: (mediaId: string) => Promise<Record<string, unknown> | null>,
  ) => void
  /**
   * Read-only access to this plugin's settings. Declared in the manifest's
   * `settings` field; the app saves values through its settings UI. Returns
   * the manifest default when nothing has been saved yet.
   */
  settings: {
    get: <T = unknown>(key: string) => T | undefined
    getAll: () => Record<string, unknown>
  }
  /**
   * Host-managed image storage. Plugins have no direct filesystem access;
   * saving artwork locally goes through this API.
   */
  images: {
    /**
     * Download an image into the app's shared images directory and return
     * the saved file's absolute path. Already-downloaded URLs are skipped.
     * The download uses the plugin's sandboxed fetch, so the URL's domain
     * must be declared in `permissions.network`. Throws when the download
     * fails or the host has no configured images directory.
     */
    save: (url: string) => Promise<string>
  }
  /** Logger scoped to this plugin */
  logger: {
    info: (message: string) => void
    warn: (message: string) => void
    error: (message: string) => void
  }
  /** Sandboxed fetch — only allows declared network domains */
  fetch: (url: string, init?: RequestInit) => Promise<Response>
}

export interface MatchResult {
  suggestedTitle: string
  suggestedMetadata: Record<string, unknown>
  /** Confidence score 0–100 */
  confidence: number
}
