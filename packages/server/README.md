# @xon/server

The core server library for Xon. Provides the Hono HTTP app, database schema, media scanning, plugin system, and all API routes. Consumed by `apps/headless`.

## Running a dev instance

The server package is a library — it's run via the `@xon/headless` app. From the repo root:

```sh
# Install dependencies
yarn install

# Start the server + web app with hot reload
yarn dev
```

`yarn dev` runs two processes concurrently:
- **Backend** — `apps/headless` via `node --watch --experimental-transform-types`, loading all workspace packages directly from TypeScript source. Restarts automatically on any `.ts` change.
- **Frontend** — Vite dev server with HMR. API calls are proxied to the backend at `localhost:32400`.

On first boot, navigate to `http://localhost:5173/` and complete the setup wizard to create the admin account.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `32400` | HTTP port |
| `DATA_DIR` | `./data` | Directory for the SQLite database |
| `WEB_CLIENT_DIR` | _(unset)_ | Path to built web client static files (production only) |
| `WEB_SSR_BUNDLE` | _(unset)_ | Path to SSR bundle for server-side rendering (production only) |

## Database

Xon uses SQLite via [libsql](https://github.com/tursodatabase/libsql). The database file is created at `$DATA_DIR/xon.db` on first run.

```sh
# Generate a new migration after changing schema.ts
yarn workspace @xon/server db:generate

# Apply pending migrations
yarn workspace @xon/server db:migrate
```

Migrations run automatically on boot, so `db:migrate` is only needed when running outside the normal server flow.

## Scripts

| Script | Description |
|---|---|
| `dev` | Unused directly — use `yarn dev` at the repo root |
| `build` | One-shot TypeScript build |
| `typecheck` | Type-check without emitting |
| `test` | Run tests with Vitest |
| `db:generate` | Generate Drizzle migrations from schema changes |
| `db:migrate` | Apply pending migrations |
