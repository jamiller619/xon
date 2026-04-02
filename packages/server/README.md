# @xon/server

The core server library for Xon. Provides the Hono HTTP app, database schema, media scanning, plugin system, and all API routes. Consumed by `apps/headless`.

## Running a dev instance

The server package is a library — it's run via the `@xon/headless` app. From the repo root:

```sh
# Install dependencies
yarn install

# Build all packages in watch mode (run in a separate terminal)
yarn workspace @xon/server dev

# Start the server (in another terminal)
yarn dev
```

`yarn dev` at the root sets `DATA_DIR` to `.data/` and `WEB_CLIENT_DIR` to the built web client, then starts the headless app.

On first boot, navigate to `http://localhost:<PORT>/` and complete the setup wizard to create the admin account.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7700` | HTTP port |
| `DATA_DIR` | `./data` | Directory for the SQLite database |
| `WEB_CLIENT_DIR` | _(unset)_ | Path to built web client static files |
| `WEB_SSR_BUNDLE` | _(unset)_ | Path to SSR bundle for server-side rendering |

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
| `dev` | Watch mode — recompiles on file changes |
| `build` | One-shot TypeScript build |
| `typecheck` | Type-check without emitting |
| `test` | Run tests with Vitest |
| `db:generate` | Generate Drizzle migrations from schema changes |
| `db:migrate` | Apply pending migrations |
