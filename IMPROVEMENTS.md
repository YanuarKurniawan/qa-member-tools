# Project Improvement Log

## v2.0.0 — Service Layer Architecture (May 2026)

**Status**: Complete

### Problem

The project had grown from CLI scripts into a hybrid CLI + Web UI application, but the architecture hadn't kept up:

- Business logic was duplicated between `src/tools/` (CLI) and `server/routes/` (API)
- Adding a new tool required touching 4+ files (route, toolConfig, CLI script, possibly component)
- Mixed `fetch`/`axios` usage in the same files
- Hardcoded URLs scattered across route files
- No environment validation — missing env vars caused cryptic runtime errors
- No linter or formatter
- Documentation referenced non-existent directories

### Solution: Service Layer with Tool Registry

Introduced a shared service layer (`src/services/`) and a tool registry (`src/registry.js`) that serves as the single source of truth.

### Changes Made

#### Architecture
- **Service layer** (`src/services/`) — All business logic extracted into pure async functions with a standard contract: `({ rows, options, onLog }) => { results }`
- **Tool registry** (`src/registry.js`) — Single configuration file defining all 19 tools with their metadata, input types, and form fields
- **Generic route handler** (`server/routes/tools.js`) — One route file replaces five, auto-wired from registry
- **Unified CLI** (`cli/index.js`) — Single CLI entry point that runs any registered tool

#### Shared Utilities (`src/lib/`)
- `config.js` — Centralized env configuration with dotenv, no more `process.env.X` scattered everywhere
- `httpClient.js` — Unified axios instance with timeout, TLS handling, and error normalization
- `csvParser.js` — Extracted CSV parsing from helpers.js
- `logger.js` — Structured log collector (replaces ad-hoc `logs[]` arrays)
- `sleep.js` — Async delay utility
- `db.js` — Updated MySQL pool to use centralized config

#### Client Updates
- Removed `toolConfig.js` — UI now fetches tool definitions from `GET /api/tools`
- `categoryMeta.js` — Lightweight icon/label mapping (no business logic in client)
- Components receive data as props from the registry API instead of importing a static config
- All API calls use `POST /api/tools/:toolId` (unified endpoint pattern)

#### Code Quality
- ESLint config (`eslint.config.js`) — flat config format
- Prettier config (`.prettierrc`) — consistent formatting
- npm scripts: `lint`, `lint:fix`, `format`
- Removed global `NODE_TLS_REJECT_UNAUTHORIZED = '0'` — TLS override moved to per-request httpClient

#### Files Removed
- `server/routes/userManagement.js` — logic moved to `src/services/user-management/`
- `server/routes/userAuth.js` — logic moved to `src/services/user-auth/`
- `server/routes/jira.js` — logic moved to `src/services/jira/`
- `server/routes/testing.js` — logic moved to `src/services/testing/`
- `server/routes/database.js` — logic moved to `src/services/database/`
- `server/helpers.js` — split into `src/lib/csvParser.js`, `src/lib/logger.js`, `src/lib/sleep.js`
- `client/src/toolConfig.js` — replaced by `/api/tools` endpoint

### Metrics

| Metric | Before (v1) | After (v2) | Change |
|--------|-------------|------------|--------|
| Route files | 5 | 1 | -80% |
| Files to add a tool | 4+ | 2 | -50% |
| Service files | 0 (logic in routes) | 19 | Proper separation |
| Code duplication | CLI + API divergent | Shared services | Eliminated |
| Env validation | None | Centralized config | Fail-fast |
| HTTP client | Mixed fetch/axios | Unified axios | Consistent |
| Linting | None | ESLint + Prettier | Added |

### How to Add a Tool (v2)

1. Create `src/services/<category>/yourTool.js`
2. Add entry to `src/registry.js`

The API route, CLI command, and UI form are auto-generated. No other files need to change.

---

## v1.0.0 — Initial Restructuring (February 2026)

**Status**: Complete

### Changes Made
- Reorganized scattered root-level scripts into `src/tools/` directory by category
- Standardized file naming to kebab-case
- Created `package.json` with 27 npm scripts
- Created comprehensive documentation (`docs/README.md`, `SETUP.md`, `TOOLS.md`, `CONTRIBUTING.md`)
- Added `.env.example` for environment configuration
- Improved `.gitignore` coverage
- Created shared utility (`src/lib/date-utils.js`)
- Added Web UI layer (React + Express) for browser-based tool access
