# QA Member Tools — Service Layer Architecture Redesign

**Date:** 2026-05-12
**Status:** Approved
**Approach:** Service Layer with Tool Registry Pattern

---

## 1. Problem Statement

The QA Member Tools project has grown from CLI scripts into a hybrid CLI + Web UI application. This growth introduced several architectural issues:

1. **Code duplication** — Business logic exists in both `src/tools/` (CLI) and `server/routes/` (API), causing drift and bugs.
2. **High friction for adding tools** — A new tool requires changes in 4+ files: CLI script, route file, `toolConfig.js`, and possibly a component.
3. **Inconsistent patterns** — Mixed `fetch`/`axios`, ad-hoc logging, scattered hardcoded URLs, no env validation.
4. **No quality guardrails** — No linter, no formatter, no tests, no config validation.
5. **Stale documentation** — Docs reference non-existent directories (`src/config/`) and describe CSV formats that don't match the API.

## 2. Goals

- **Single source of truth** for all business logic (services).
- **Adding a new tool = 1 service file + 1 registry entry.** No route files, no client config changes.
- **CLI and Web UI always in sync** because they share the same services.
- **Consistent, tested patterns** with proper error handling, logging, and config.
- **Clean, navigable codebase** that's easy to understand and contribute to.

## 3. Non-Goals

- Switching frameworks (staying with Express + React).
- Adding a test framework in this iteration (the service layer makes this trivial to add later).
- Changing the UI design or component library.
- Adding user authentication/sessions (API key stays).
- Monorepo tooling (turborepo/nx).

## 4. Architecture Overview

### 4.1 New Folder Structure

```
qa-member-tools/
├── src/
│   ├── services/                    # ALL business logic
│   │   ├── user-management/
│   │   │   ├── batchRegister.js
│   │   │   ├── batchRegisterGk.js
│   │   │   ├── setPassword.js
│   │   │   ├── upgradeTier.js
│   │   │   └── injectProfile.js
│   │   ├── user-auth/
│   │   │   ├── copyRolePrivilege.js
│   │   │   ├── deleteEmail.js
│   │   │   └── getAccountId.js
│   │   ├── jira/
│   │   │   ├── getTestrailLink.js
│   │   │   ├── updateParent.js
│   │   │   ├── dynamicTransition.js
│   │   │   └── createReport.js
│   │   ├── testing/
│   │   │   ├── testrailSections.js
│   │   │   ├── testrailCases.js
│   │   │   └── curlCall.js
│   │   └── database/
│   │       └── updateAccountId.js
│   ├── lib/                         # Shared utilities
│   │   ├── db.js                    # MySQL pool (migrated from existing)
│   │   ├── httpClient.js            # Unified axios instance
│   │   ├── csvParser.js             # CSV parsing utility
│   │   ├── logger.js                # Structured log collector
│   │   └── config.js                # Env validation & centralized config
│   └── registry.js                  # Tool registry (single source of truth)
├── server/
│   ├── index.js                     # Express setup (thinner)
│   ├── middleware/
│   │   ├── auth.js                  # API key auth (unchanged)
│   │   └── upload.js                # Multer config (unchanged)
│   └── routes/
│       └── tools.js                 # Single generic route handler
├── cli/
│   └── index.js                     # CLI entry point (thin wrapper)
├── client/
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── Sidebar.jsx
│       │   ├── ToolForm.jsx
│       │   ├── CsvUpload.jsx
│       │   ├── LogViewer.jsx
│       │   └── ResultsTable.jsx
│       └── pages/
│           ├── Dashboard.jsx
│           └── ToolPage.jsx
├── docs/
├── .eslintrc.js
├── .prettierrc
└── package.json
```

**What's removed:**
- `src/tools/` — replaced by `src/services/` (pure logic, no I/O coupling)
- `server/routes/userManagement.js`, `userAuth.js`, `jira.js`, `testing.js`, `database.js` — replaced by single `tools.js`
- `server/helpers.js` — split into proper `src/lib/` modules
- `client/src/toolConfig.js` — derived from registry via `/api/tools` endpoint

### 4.2 Tool Registry

The registry is the single definition of every tool in the system. It drives the API routes, CLI commands, and UI forms.

```javascript
// src/registry.js
module.exports = [
  {
    id: 'batch-register',
    name: 'Batch Register',
    category: 'user-management',
    description: 'Register multiple users from CSV file',
    service: 'user-management/batchRegister',   // resolved relative to src/services/
    input: {
      type: 'csv',                    // 'csv' | 'form' | 'csv+form'
      csvColumns: ['email', 'password', 'firstName', 'lastName'],
      fields: [
        {
          name: 'environment',
          label: 'Environment',
          type: 'select',
          options: [
            { value: 'sandbox', label: 'Sandbox' },
            { value: 'gk', label: 'GK' }
          ],
          default: 'sandbox'
        }
      ]
    },
    output: {
      hasLogs: true,
      hasResults: true,
      resultColumns: ['email', 'status', 'message']
    }
  },
  {
    id: 'delete-email',
    name: 'Delete Email from UNM',
    category: 'user-auth',
    description: 'Preview and delete email entries from UNM',
    service: 'user-auth/deleteEmail',            // resolved relative to src/services/
    input: {
      type: 'csv',
      csvColumns: ['email']
    },
    output: {
      hasLogs: true,
      hasResults: true,
      hasConfirmStep: true              // Triggers preview → confirm flow
    }
  },
  // ... all other tools follow the same shape
];
```

### 4.3 Service Contract

Every service exports an async function with a standardized signature:

```javascript
// src/services/user-management/batchRegister.js
const httpClient = require('../../lib/httpClient');
const config = require('../../lib/config');

module.exports = async function batchRegister({ rows, options, onLog }) {
  const results = [];
  const baseUrl = options.environment === 'gk'
    ? config.MEMBER_BASE_URL_GK
    : config.MEMBER_BASE_URL;

  for (const row of rows) {
    onLog(`Processing ${row.email}...`);
    try {
      const res = await httpClient.post(`${baseUrl}/register`, {
        email: row.email,
        password: row.password,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      results.push({ email: row.email, status: 'success', message: res.data.message || 'OK' });
      onLog(`OK ${row.email}`);
    } catch (err) {
      results.push({ email: row.email, status: 'error', message: err.message });
      onLog(`FAIL ${row.email}: ${err.message}`);
    }
  }

  return { results };
};
```

**Contract rules:**
- **Input:** `{ rows, options, onLog }` — `rows` is an array of parsed CSV objects (empty array for form-only tools); `options` is a plain object from form fields; `onLog(message)` is a callback for progress streaming.
- **Output:** `{ results }` — array of result objects. Optionally `{ results, preview }` for confirm-step tools.
- **No `req`/`res`** — services never touch Express objects.
- **Throws on fatal errors** — the route handler catches and formats.

**For confirm-step tools** (like delete-email), the service exports two functions:

```javascript
module.exports = {
  preview: async function({ rows, options, onLog }) { ... },
  confirm: async function({ rows, options, onLog, previewData }) { ... }
};
```

### 4.4 Generic Route Handler

One route file replaces five:

```javascript
// server/routes/tools.js
const express = require('express');
const router = express.Router();
const registry = require('../../src/registry');
const upload = require('../middleware/upload');
const { parseCsvFile } = require('../../src/lib/csvParser');

// GET /api/tools — returns registry metadata for the client
router.get('/', (req, res) => {
  const tools = registry.map(({ service, ...meta }) => meta);
  res.json(tools);
});

// POST /api/tools/:toolId — execute a tool
router.post('/:toolId', upload.single('file'), async (req, res) => {
  const tool = registry.find(t => t.id === req.params.toolId);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const logs = [];
  const onLog = (msg) => logs.push(msg);

  try {
    const servicePath = path.join(__dirname, '../../src/services', tool.service);
    const serviceFn = require(servicePath);
    let rows = [];
    if (req.file) {
      rows = await parseCsvFile(req.file.path);
    }
    const options = req.body;
    const result = await (typeof serviceFn === 'function'
      ? serviceFn({ rows, options, onLog })
      : serviceFn.preview({ rows, options, onLog }));

    res.json({ logs, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// POST /api/tools/:toolId/confirm — for confirm-step tools
router.post('/:toolId/confirm', upload.single('file'), async (req, res) => {
  const tool = registry.find(t => t.id === req.params.toolId);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const logs = [];
  const onLog = (msg) => logs.push(msg);

  try {
    const servicePath = path.join(__dirname, '../../src/services', tool.service);
    const serviceFn = require(servicePath);
    if (!serviceFn.confirm) {
      return res.status(400).json({ error: 'Tool does not support confirm step' });
    }
    let rows = [];
    if (req.file) rows = await parseCsvFile(req.file.path);
    const result = await serviceFn.confirm({
      rows,
      options: req.body,
      onLog,
      previewData: JSON.parse(req.body.previewData || '{}')
    });
    res.json({ logs, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
```

### 4.5 CLI Wrapper

```javascript
// cli/index.js
const registry = require('../src/registry');
const { parseCsvFile } = require('../src/lib/csvParser');

async function main() {
  const [toolId, csvPath, ...args] = process.argv.slice(2);

  const tool = registry.find(t => t.id === toolId);
  if (!tool) {
    console.error(`Unknown tool: ${toolId}`);
    console.log('Available:', registry.map(t => t.id).join(', '));
    process.exit(1);
  }

  const servicePath = path.join(__dirname, '../src/services', tool.service);
  const serviceFn = require(servicePath);
  const rows = csvPath ? await parseCsvFile(csvPath) : [];
  const options = Object.fromEntries(
    args.map(a => a.split('=')).filter(p => p.length === 2)
  );

  const onLog = (msg) => console.log(msg);

  const fn = typeof serviceFn === 'function' ? serviceFn : serviceFn.preview;
  const { results } = await fn({ rows, options, onLog });

  if (results?.length) {
    console.table(results);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Usage:** `node cli/index.js batch-register users.csv environment=sandbox`

### 4.6 Client Changes

**`toolConfig.js` is removed.** Instead, `App.jsx` fetches `/api/tools` at startup and passes the registry data to components.

The existing components (`ToolForm`, `CsvUpload`, `LogViewer`, `ResultsTable`, `Sidebar`) already work data-driven. The main changes:
- API endpoints become `POST /api/tools/${toolId}` (instead of domain-specific paths).
- Sidebar categories derived from registry's `category` field.
- Confirm-step tools POST to `/api/tools/${toolId}/confirm`.

## 5. Shared Utilities

### 5.1 `src/lib/config.js` — Centralized Configuration

```javascript
const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback) => process.env[key] || fallback;

module.exports = {
  PORT: optional('PORT', 3456),
  API_KEY: optional('API_KEY', ''),
  CORS_ALLOWED_ORIGINS: optional('CORS_ALLOWED_ORIGINS', 'http://localhost:5173'),

  // UNM / Member
  UNM_BASE_URL: optional('UNM_BASE_URL', ''),
  UNM_CHALLENGE: optional('UNM_CHALLENGE', ''),
  UNM_PREPROD_CHALLENGE: optional('UNM_PREPROD_CHALLENGE', ''),
  MEMBER_BASE_URL: optional('MEMBER_BASE_URL', ''),

  // Jira
  JIRA_BASE_URL: optional('JIRA_BASE_URL', ''),
  JIRA_EMAIL: optional('JIRA_EMAIL', ''),
  JIRA_API_TOKEN: optional('JIRA_API_TOKEN', ''),

  // TestRail
  TESTRAIL_BASE_URL: optional('TESTRAIL_BASE_URL', ''),
  TESTRAIL_USER: optional('TESTRAIL_USER', ''),
  TESTRAIL_API_KEY: optional('TESTRAIL_API_KEY', ''),

  // Database
  DB_HOST: optional('DB_HOST', ''),
  DB_PORT: optional('DB_PORT', 3306),
  DB_USER: optional('DB_USER', ''),
  DB_PASSWORD: optional('DB_PASSWORD', ''),
  DB_NAME: optional('DB_NAME', ''),

  // Security
  ALLOWED_CURL_HOSTS: optional('ALLOWED_CURL_HOSTS', '').split(',').filter(Boolean),
};
```

All env vars accessed via this module — no more `process.env.X` scattered across files. Services that need specific vars will fail clearly if they're missing.

### 5.2 `src/lib/httpClient.js` — Unified HTTP Client

Single axios instance replacing mixed fetch/axios usage. Configured with:
- Base timeout (30s default).
- Per-request TLS override via `httpsAgent` for known internal services (replaces global `NODE_TLS_REJECT_UNAUTHORIZED = '0'`).
- Response/error interceptors for consistent error messages.

### 5.3 `src/lib/csvParser.js` — CSV Parsing

Extracted from `server/helpers.js`. Single function: `parseCsvFile(filePath) → Promise<Object[]>`.

### 5.4 `src/lib/logger.js` — Log Collector

Creates per-request log collectors that services use via `onLog()`. In the HTTP context, logs are collected and returned in the response. In CLI context, `onLog` maps to `console.log`.

## 6. Code Quality

### 6.1 ESLint + Prettier

- `.eslintrc.js` — standard Node.js rules, no-unused-vars, consistent-return, etc.
- `.prettierrc` — single quotes, 2-space indent, trailing commas.
- npm scripts: `lint`, `lint:fix`, `format`.

### 6.2 Security Improvements

- Remove global `NODE_TLS_REJECT_UNAUTHORIZED = '0'` — use per-request `httpsAgent` with `rejectUnauthorized: false` only where needed.
- Keep SSRF protection on curl-call (`ALLOWED_CURL_HOSTS`).
- `.env` stays gitignored; `.env.example` updated to match new config structure.

### 6.3 Error Handling

- Services throw errors; the generic route handler catches them.
- Typed error responses: `{ error: string, logs: string[] }`.
- Config validation fails fast at startup with clear messages.

## 7. Migration Strategy

The refactoring happens in phases to avoid a big-bang rewrite:

1. **Phase 1:** Create `src/lib/` utilities (config, httpClient, csvParser, logger).
2. **Phase 2:** Create `src/registry.js` with all tool definitions.
3. **Phase 3:** Extract services one by one from `server/routes/` into `src/services/`, starting with the simplest tools.
4. **Phase 4:** Create generic route handler (`server/routes/tools.js`) and wire it up.
5. **Phase 5:** Create CLI wrapper (`cli/index.js`).
6. **Phase 6:** Update client to use `/api/tools` endpoint.
7. **Phase 7:** Remove old files (`src/tools/`, old route files, `toolConfig.js`, `helpers.js`).
8. **Phase 8:** Add ESLint/Prettier, clean up docs.

## 8. What Stays Unchanged

- React component structure (Layout, Sidebar, ToolForm, CsvUpload, LogViewer, ResultsTable).
- Express as the server framework.
- MySQL connection via `mysql2/promise`.
- Tailwind CSS + lucide-react for styling.
- API key authentication middleware.
- Multer for file uploads.
- Vite for client dev/build.

## 9. Success Criteria

- Adding a new tool requires exactly 2 changes: one service file + one registry entry.
- Zero code duplication between CLI and Web UI.
- All env vars validated at startup with clear error messages.
- Consistent HTTP client usage (no mixed fetch/axios).
- ESLint passes with zero warnings.
- Documentation matches the actual codebase.
