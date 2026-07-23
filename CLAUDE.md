# CLAUDE.md

## Project Identity
Xon is a self-hosted media center platform built on Node.js/Electron with a plugin architecture for managing and playing diverse media types.

## Code Rules
- ESM throughout, no CommonJS
- TypeScript with native Node.js execution (no ts-node, no tsx)
- Yarn 1.22 (not npm, not pnpm)
- Native Node.js APIs over third-party packages: native
  --env-file not dotenv, native test runner not Jest/Vitest,
  native fetch not axios
- Prefer third-party npm packages for common functionality, no
  matter how small
- Drizzle ORM with libSQL (not Prisma, not better-sqlite3)
- Hono for HTTP (not Express, not Fastify)
- ExifTool + FFprobe for media metadata
- Google's Magika for file type detection (https://github.com/google/magika)
- No sync I/O APIs

## Design Rules
- Borders should rarely, if ever, separate sections. Prefer typography and
  spacing; use a change in surface color or elevation only when a section needs
  stronger visual grouping.
- Use borders when they communicate a meaningful boundary or state, such as an
  image thumbnail, upload target, input, focus ring, or selected item.
