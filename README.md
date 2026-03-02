# Automation Console

Automation Console is a desktop task runner built with Electron + React + TypeScript. It includes a scheduler engine, proxy health checks, profile management with secrets stored in OS keychain, and CSV/JSON export.

## Features
- Task dashboard with Run All / Stop All / Delete All + import/export
- Profiles module (no payment data stored); tokens saved via OS Keychain (keytar)
- Proxy manager with health checks and latency
- Task manager CRUD (URL, siteKey, desiredQty, intervalMs, group)
- Core engine: scheduler + concurrency + rate limiting + retry/backoff
- Adapter/plugin architecture per target website
- Desktop notifications + ?Open URL? action on AVAILABLE
- SQLite storage + migrations
- electron-builder packaging + electron-updater auto-update support

## Tech Stack
- Electron + React + TypeScript
- SQLite (better-sqlite3)
- keytar for secrets
- bottleneck + p-queue + p-retry for scheduling
- electron-updater + electron-builder for release

## Current Project Structure
```
src/
  main/                # Electron main (engine, db, adapters)
  preload/             # IPC bridge
  renderer/            # React UI
  shared/              # Types + IPC contracts
```

## Monorepo Blueprint (pnpm + Turbo)
See `docs/monorepo.md` for the full layout.

## Dependencies (core)
- better-sqlite3
- keytar
- bottleneck
- p-queue
- p-retry
- undici
- csv-stringify / csv-parse

## Bootstrap

### npm (current)
```
npm install
npm run dev
```

### pnpm (monorepo-ready)
```
pnpm install
pnpm run dev
```

## Database Schema (SQLite)
Tables defined in `src/main/db/migrations.ts`.

- `tasks`
  - id, name, url, siteKey, desiredQty, intervalMs, groupName, proxyId, profileId
  - status, lastRunAt, lastResult, createdAt, updatedAt
- `proxies`
  - id, host, port, username, passwordRef (keytar), status, lastLatencyMs, lastCheckedAt
- `profiles`
  - id, name, email, phone, address*, notes, secretKeys (keytar refs)
- `logs`
  - id, taskId, level, message, meta, createdAt
- `schema_migrations`

## IPC Contracts
Defined in `src/shared/ipc.ts`.

- Tasks
  - `tasks:list`, `tasks:create`, `tasks:update`, `tasks:remove`, `tasks:removeAll`
  - `tasks:run`, `tasks:stop`, `tasks:runAll`, `tasks:stopAll`
  - `tasks:import`, `tasks:export`
- Proxies
  - `proxies:list`, `proxies:createMany`, `proxies:removeAll`, `proxies:checkAll`, `proxies:export`
- Profiles
  - `profiles:list`, `profiles:create`, `profiles:update`, `profiles:remove`, `profiles:saveSecrets`
- Engine
  - `engine:status`, `engine:availability`, `engine:log`
- App helpers
  - `app:openTextFile`, `app:saveTextFile`

## Core Engine Design
- **Queue**: `p-queue` limits overall concurrency
- **Rate limiting**: `bottleneck` enforces minTime and maxConcurrent
- **Retry/Backoff**: `p-retry` with exponential backoff
- **State machine**: IDLE ? SCHEDULED ? RUNNING ? AVAILABLE/IDLE ? ERROR/BACKOFF
- **Logging**: persisted to SQLite, streamed via IPC
- **Realtime UI**: IPC events for status + availability + logs

## UI Screens
- Tasks: table with status badges, run/stop controls, import/export
- Proxies: list, health checks, latency + status
- Profiles: form + secrets stored in Keychain
- Logs: engine activity feed

## Tests
```
npm run test
```

Unit tests live under `src/main/core/__tests__` (adapter registry + engine).

## Release Builds

### Windows
```
npm run build:win
```

### macOS
```
npm run build:mac
```

Auto-updates are configured in `electron-builder.yml` and `dev-app-update.yml` (generic provider by default). Replace the update URL with your own server or GitHub releases.

## CI (GitHub Actions)
A sample workflow is provided in `.github/workflows/ci.yml` for lint/typecheck/test/build.

## Security Notes
- No payment card data is collected or stored.
- Tokens/secrets are stored using the OS keychain via keytar.
- Proxy passwords are stored using keytar references (passwordRef).

## Import / Export
- Tasks: JSON/CSV import + export
- Proxies: JSON/CSV export, text import (host:port:user:pass)
