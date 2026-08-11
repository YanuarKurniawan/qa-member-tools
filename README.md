# QA Member Tools

A suite of automation tools for member services, user management, Jira/TestRail, and QA operations. Features both a **Web UI** and **CLI** interface, powered by a shared service layer.

## Quick Start

### Requirements
- Node.js v18+
- npm v8+

### Setup
```bash
# 1. Install dependencies
npm install
cd client && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Edit .env with your API credentials

# 3. Run the Web UI + API server
npm run dev

# 4. Open http://localhost:5173 in your browser
```

## Architecture

```
qa-member-tools/
├── src/
│   ├── services/          # Business logic (single source of truth)
│   │   ├── user-management/
│   │   ├── user-auth/
│   │   ├── jira/
│   │   ├── testing/
│   │   └── database/
│   ├── lib/               # Shared utilities
│   │   ├── config.js      # Centralized env config
│   │   ├── httpClient.js  # Unified HTTP client (axios)
│   │   ├── csvParser.js   # CSV parsing
│   │   ├── logger.js      # Log collector
│   │   ├── sleep.js       # Async delay
│   │   └── db.js          # MySQL connection pool
│   └── registry.js        # Tool registry (drives API + CLI + UI)
├── server/                # Express API
│   ├── index.js
│   ├── middleware/
│   └── routes/tools.js    # Single generic route handler
├── cli/                   # CLI interface
│   └── index.js
├── client/                # React + Tailwind UI
│   └── src/
└── docs/
```

**Key design principle:** All business logic lives in `src/services/`. The server routes, CLI, and UI are thin wrappers. Adding a new tool requires only 2 changes: one service file + one registry entry.

## Web UI

The Web UI provides a dashboard with all tools organized by category. Each tool has a form interface with CSV upload support, live log output, and downloadable results. See also the [Test Runner](docs/TOOLS.md#test-runner) page for keyboard-driven TestRail run execution.

```bash
npm run dev          # Start dev server (API + Vite)
npm run build        # Build for production
npm start            # Start production server
```

## CLI

All tools are also available via the unified CLI:

```bash
# Show all available tools
npm run cli -- --help

# Run a tool with CSV input
npm run cli -- batch-register users.csv

# Run a tool with options
npm run cli -- inject-profile accountId=12345 count=10 env=test

# Run a tool with CSV + options
npm run cli -- get-account-id emails.csv env=test memberType=B2C
```

## Available Tools

### User Management
| Tool | Description | Input |
|------|-------------|-------|
| `batch-register` | Register users (Sandbox) | CSV: Name, Email, phoneCode, phoneNumber, Level |
| `batch-register-gk` | Register users (GK) | CSV: Name, Email, phoneCode, phoneNumber, Level |
| `set-password` | Batch reset passwords | CSV: accountId, phoneCode, phoneNumber, password |
| `upgrade-tier` | Upgrade user tiers | CSV: accountId, Level |
| `inject-profile` | Inject passenger profiles | Form: accountId, count, env |

### User Auth
| Tool | Description | Input |
|------|-------------|-------|
| `copy-role` | Copy roles & privileges between accounts | Form: sourceEmail, targetEmail, env |
| `delete-email` | Remove email from account (preview + confirm) | Form: email, env |
| `get-account-id` | Fetch account IDs from emails | CSV: email + Form: env, memberType |

### Jira & TestRail
| Tool | Description | Input |
|------|-------------|-------|
| `get-testrail-link` | Extract TestRail links from Jira | CSV: issueKey |
| `update-parent` | Update Jira parent issues | CSV: issueKey, parentId + dryRun |
| `dynamic-transition` | Move issues through workflow | CSV: issueKey, targetTransitionName + dryRun |
| `create-report` | TestRail execution report | Form: projectId, dates |

### Testing
| Tool | Description | Input |
|------|-------------|-------|
| `testrail-add-section` | Add sections to TestRail | CSV: foldername, endpoint + projectId, parentId, suiteId |
| `testrail-get-section-id` | Get section IDs by parent | Form: projectId, suiteId, parentId |
| `testrail-update-case` | Update case preconditions | CSV: ID, Precond, Results |
| `testrail-update-section` | Update section names | CSV: id, name |
| `curl-call` | Execute curl commands from CSV | CSV: Steps |

### Database
| Tool | Description | Input |
|------|-------------|-------|
| `update-account-id` | Update single account ID | Form: oldAccountId, newAccountId, dryRun |
| `bulk-update-account-id` | Bulk update from CSV | CSV: accountId, newAccountId + dryRun |

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | API server port (default: 3456) |
| `API_KEY` | No | Enable API key auth |
| `JIRA_BASE_URL` | For Jira tools | Jira instance URL |
| `JIRA_EMAIL` | For Jira tools | Jira email |
| `JIRA_API_TOKEN` | For Jira tools | Jira API token |
| `TESTRAIL_BASE_URL` | For TestRail tools | TestRail URL |
| `TESTRAIL_USER` | For TestRail tools | TestRail username |
| `TESTRAIL_API_KEY` | For TestRail tools | TestRail API key |
| `UNM_*` | For UNM tools | UNM auth headers (test/preprod) |
| `DB_*` | For DB tools | MySQL connection settings |

## Adding a New Tool

1. Create a service file in `src/services/<category>/yourTool.js`:

```javascript
module.exports = async function yourTool({ rows, options, onLog }) {
  onLog.info('Starting...');
  const results = [];
  // your logic here
  onLog.success('Done');
  return { results };
};
```

2. Add an entry to `src/registry.js`:

```javascript
{
  id: 'your-tool',
  name: 'Your Tool',
  category: 'testing',
  description: 'What it does',
  service: 'testing/yourTool',
  input: { type: 'csv', csvInfo: '...', csvExample: '...' },
  output: { hasLogs: true, hasResults: true },
}
```

That's it. The API route, CLI command, and UI form are auto-generated from the registry.

## Important Notes

1. **Always backup data** before running bulk operations
2. **Test with small datasets** first
3. **Never commit `.env`** to version control
4. **Use dry run** when available to preview changes
5. **Check logs** for errors and warnings

## License

MIT

---

**Version**: 2.0.0
**Maintained by**: QA Team
