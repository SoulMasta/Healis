# Healis Development Guide

PERN-stack knowledge-sharing platform (PostgreSQL, Express, React, Node.js).

## Cursor Cloud specific instructions

### Architecture

- **Server** (`server/`): Express 5 + Socket.IO backend on port 5000. Entry: `server/index.js`.
- **Client** (`client/`): React 19 SPA (Create React App) on port 3000.
- No TypeScript. Package manager is **npm** (lockfiles in `server/` and `client/`).

### Starting services

1. **PostgreSQL** must be running before the server starts. Start with `sudo pg_ctlcluster 16 main start`.
2. **Server**: `npm run dev` in `server/` (uses nodemon for hot-reload).
3. **Client**: `npm start` in `client/` (CRA dev server, set `BROWSER=none` to avoid opening a browser).

### Environment files

Both `server/.env` and `client/.env` must exist. See `readme.md` for env var documentation.

- Server requires at minimum: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `SECRET_KEY`, `PORT`.
- Client requires: `REACT_APP_API_URL=http://localhost:5000`.
- Set `DB_SYNC_ALTER=true` in server `.env` for auto-schema sync during development.
- Supabase and Google OAuth env vars are optional; the app works without them (file uploads and Google sign-in disabled).

### Lint / Test / Build

- **Lint**: `npx eslint src/` in `client/` (ESLint with react-app preset).
- **Tests**: `CI=true npm test -- --passWithNoTests` in `client/`. No test files currently exist.
- **Build**: `npm run build` in `client/`.
- Server has no lint or test configuration.

### Gotchas

- The server logs extensively to stderr during boot (`[BOOT]` lines) — this is normal.
- Server gracefully handles missing Ollama/Supabase/Google config; those features just become unavailable.
- The server runs schema migrations inline on startup (no separate migrate command needed).
- Express 5 is used (not 4), which affects error handling and route matching.
