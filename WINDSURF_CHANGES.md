# Windsurf Change Log

This file tracks all changes made in Windsurf to reproduce the Replit app locally.

## 2026-03-14

### Workspace
- Copied project from Downloads into Windsurf workspace:
  - From: `C:\Users\sydel\Downloads\Time-Tracker-Assets\Time-Tracker-Assets`
  - To: `C:\Users\sydel\CascadeProjects\FMS Guyana Portal\Time-Tracker-Assets`

### package.json
- Updated scripts to use `cross-env` for Windows compatibility:
  - `dev`: `NODE_ENV=development ...` -> `cross-env NODE_ENV=development ...`
  - `start`: `NODE_ENV=production ...` -> `cross-env NODE_ENV=production ...`
- Added dev dependency: `cross-env@^7.0.3`

### server/index.ts
- Added `import "dotenv/config";` so local `.env` files are loaded automatically.

### Dependencies
- Added `dotenv@^16.6.1`.
- Added `dotenv-cli@^7.4.4` to ensure CLI tools (Drizzle) can load `.env`.

### Scripts
- Updated `db:push` to load `.env` automatically:
  - `drizzle-kit push` -> `dotenv -e .env -- drizzle-kit push`

### server/routes.ts
- Fixed startup crash during seed: geofences were being inserted twice, causing unique constraint errors.
- Made geofence seed idempotent by only inserting missing names.

### server/index.ts
- Fixed Windows startup error `listen ENOTSUP` by disabling `reusePort` on Windows.

### Offline MVP
- Added client-side offline cache + queue:
  - `client/src/lib/offlineDb.ts`
  - `client/src/lib/offlineApi.ts`
  - `client/src/lib/offlineSync.ts`
- Wired offline caching/queue into:
  - `client/src/hooks/use-geofences.ts`
  - `client/src/hooks/use-timesheets.ts`
  - `client/src/hooks/use-requests.ts`
- Added auto-sync on reconnect in `client/src/App.tsx`.

### .env
- Added `.env` with `PORT=5000` and `DATABASE_URL` for local PostgreSQL.
- URL-encoded special characters in the DB password for correct parsing (`&` -> `%26`, `@` -> `%40`).
- Updated Postgres port in `DATABASE_URL` to `5433` (matches pgAdmin connection).

### Local setup
- Ran `npm install` to restore dependencies.

### Current blocker
- App requires `DATABASE_URL` (PostgreSQL). Server exits if not set.
