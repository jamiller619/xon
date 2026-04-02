<!-- marketing copy goes here -->

---

## Architecture

Xon is a TypeScript monorepo managed with Yarn workspaces. The workspace is divided into three areas:

```
apps/        Runnable applications
packages/    Shared libraries
plugins/     First-party plugins
```

### Apps

| App | Description |
|---|---|
| `web` | React frontend. Served as static files by the server, with optional SSR. |
| `headless` | Thin Node.js entry point. Imports `@xon/server` and calls `boot()`. Intended for running Xon as a background service. |
| `desktop` | Electron wrapper for `@xon/server`. For use on servers with a GUI, or as a desktop app. |

### Packages

| Package | Description |
|---|---|
| `server` | The core. HTTP API, database, media scanner, plugin runtime, WebSocket, auth, scheduler. Cannot run on its own, requires `@xon/headless` or `@xon/desktop`. |
| `shared` | Types, Zod schemas, and constants (port, media categories, user roles) shared across the monorepo. |
| `media-types` | Exhaustive definitions of supported media categories. |
| `plugin-sdk` | Base classes and types for building plugins (`BasePlugin`, `MediaProviderPlugin`, `BackupTargetPlugin`). |

### Plugins

Plugins live in `plugins/` and depend only on `@xon/plugin-sdk` and `@xon/shared`. Each plugin declares a manifest in its `package.json` under the `"xon"` key, including a `permissions` block that allowlists the external hosts it may contact.

First-party plugins:

| Plugin | Category | Description |
|---|---|---|
| `tmdb-metadata` | MetadataSource | Movie and TV metadata from The Movie Database |
| `musicbrainz-metadata` | MetadataSource | Music metadata and cover art from MusicBrainz / Cover Art Archive |
| `openlibrary-metadata` | MetadataSource | Book metadata from Open Library |
| `3d-model-viewer` | Viewer | In-browser viewer for 3D model files |

---

## Technology choices

### Hono (HTTP framework)
Hono is a small, fast web framework with no Node.js-specific
dependencies and built on Web Standards. Runs everywhere. This keeps the
server portable across runtimes and makes the `@xon/server`
package reusable in contexts beyond a plain Node.js process.

### SQLite via libsql + Drizzle ORM
A self-hosted media server should have zero required infrastructure. SQLite means no separate database process to install, configure, or keep running. libsql is the embedded SQLite fork used by Turso, which adds WAL mode and remote replication if ever needed. Drizzle provides type-safe queries and a migration system without the overhead of a traditional ORM.

### React 19 + Vite + React Router 7
The web client is a standard React SPA built with Vite, with an optional SSR path (`entry-server.tsx`) that the Node server can invoke for faster first loads. React Router 7 handles both client-side routing and the SSR render. Zustand is used for lightweight client state.

### Electron (desktop app)
The desktop app wraps the same `@xon/server` package that
runs in headless mode. This adds more OS integration, such
as tray icons and system notifications.

### Plugins
Plugins give Xon extensibility while keeping the core small. The SDK defines three plugin types:

- **MediaProviderPlugin** — custom data sources (e.g. a network share, a cloud storage bucket)
- **BackupTargetPlugin** — custom backup destinations
- **BasePlugin** — general-purpose: custom routes, event listeners, UI injection points

Each plugin's manifest declares its network permissions
explicitly. The plugin runtime enforces this allowlist, so a
rogue plugin cannot make arbitrary outbound requests. As
always, be careful of what you install, and don't blindly
trust the source of any plugin at first.

### Monorepo with Yarn workspaces
Sharing types between the server and the web client without publishing packages is the primary reason for the monorepo. `@xon/shared` and `@xon/media-types` are imported directly by both `@xon/server` and `@xon/web`, guaranteeing that API shapes and media category enums stay in sync across the stack at compile time.

### Biome (linting + formatting)
Biome replaces ESLint and Prettier with a single fast tool and a single config file at the repo root. One `biome check .` covers the entire codebase.
