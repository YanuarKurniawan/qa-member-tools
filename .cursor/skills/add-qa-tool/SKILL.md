---
name: add-qa-tool
description: Add a new QA tool to the project from a curl command and description. Use when the user provides a curl command, API endpoint, or asks to add/create a new tool for the QA tools suite.
---

# Add QA Tool

Create a new tool from a curl command (and optional explanation). Two files to create, nothing else.

## Input

The user provides:
1. **A curl command** (or multiple) showing the API call(s) the tool should make
2. **A short explanation** of what it does, expected CSV columns, any special behavior

## Steps

### 1. Parse the curl

Extract from the curl:
- Method, URL, headers, body
- Identify which parts are dynamic (vary per row/user) vs static
- Identify which values should come from CSV rows vs form fields vs `.env`

### 2. Pick an ID and category

- **ID**: kebab-case, descriptive (e.g. `bulk-assign-role`)
- **Category**: one of `user-management`, `user-auth`, `jira`, `testing`, `database`
- If none fit, ask the user

### 3. Create the service file

Path: `src/services/<category>/<camelCaseId>.js`

Follow this contract exactly:

```javascript
const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

module.exports = async function toolName({ rows, options, onLog }) {
  // rows = parsed CSV array (empty for form-only tools)
  // options = form field values from the UI
  // onLog = { info(msg), success(msg), error(msg), warn(msg) }

  const results = [];

  // For CSV tools: iterate rows
  for (const row of rows) {
    try {
      onLog.info(`Processing ${row.someField}...`);
      const res = await fetch(url, { method, headers, body });
      const data = await res.json();
      results.push({ ...row, status: 'SUCCESS' });
      onLog.success(`Done: ${row.someField}`);
    } catch (err) {
      results.push({ ...row, status: 'ERROR', error: err.message });
      onLog.error(`Failed: ${row.someField}: ${err.message}`);
    }
  }

  return { results };
};
```

Rules:
- **No `require('express')`** — services never touch Express
- Use `onLog.info/success/error/warn` — never `console.log`
- Use `fetch` for HTTP calls (available globally in Node 18+)
- Use `require('../../lib/httpClient')` (axios) only when you need interceptors or axios-specific features
- Use `require('../../lib/config')` for env vars — never `process.env` directly
- Add `await sleep(ms)` between API calls when doing bulk operations to avoid rate limiting
- Return `{ results }` where results is an array of objects
- For **form-only tools** (no CSV): read values from `options` instead of `rows`
- For **confirm-step tools** (preview then confirm): export `{ preview, confirm }` instead of a single function

### 4. Add registry entry

Add to `src/registry.js` in the appropriate category section:

```javascript
{
  id: 'your-tool-id',
  name: 'Human Readable Name',
  category: 'category-id',
  description: 'One-line description for the UI',
  service: 'category/camelCaseFileName',
  input: {
    // For CSV tools:
    type: 'csv',
    csvInfo: 'CSV columns: col1, col2, col3',
    csvExample: 'col1,col2,col3\nvalue1,value2,value3',
    // Optional extra form fields alongside CSV:
    extraFields: [
      { name: 'fieldName', label: 'Label', type: 'select', options: [...], required: true },
      { name: 'dryRun', label: 'Dry Run', type: 'checkbox', description: 'Preview only' },
    ],

    // For form-only tools:
    type: 'form',
    fields: [
      { name: 'fieldName', label: 'Label', type: 'text', placeholder: '...', required: true },
      { name: 'env', label: 'Environment', type: 'select', options: [
        { value: 'test', label: 'Test' },
        { value: 'preprod', label: 'Pre-production' },
      ], required: true },
    ],
  },
  output: { hasLogs: true, hasResults: true },
  // Add hasConfirmStep: true inside output if the tool uses preview/confirm
}
```

**Field types**: `text`, `number`, `email`, `date`, `select`, `checkbox`

### 5. Add config entries (if needed)

If the curl uses credentials/URLs not already in `src/lib/config.js`:
1. Add the new env var to `src/lib/config.js`
2. Add the placeholder to `.env.example`

### 6. Verify

Run this to confirm the service loads:

```bash
node -e "const r = require('./src/registry'); const s = require('./src/services/' + r.find(t=>t.id==='YOUR_ID').service); console.log('OK:', typeof s);"
```

## That's it

Two files: one service, one registry entry. The API route (`POST /api/tools/:id`), CLI command (`node cli/index.js <id>`), and UI form are all auto-generated.

## Reference

### Existing categories
- `user-management` — registration, passwords, tiers, profiles
- `user-auth` — roles, privileges, email management, account lookup
- `jira` — Jira issues, TestRail reporting
- `testing` — TestRail sections/cases, curl execution
- `database` — MySQL account ID updates

### Config vars already available (`src/lib/config.js`)
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- `TESTRAIL_BASE_URL`, `TESTRAIL_USER`, `TESTRAIL_API_KEY`
- `UNM_TEST_CHALLENGE`, `UNM_TEST_CHALLENGE_SIGNATURE`, `UNM_TEST_USERNAME`
- `UNM_PREPROD_CHALLENGE`, `UNM_PREPROD_CHALLENGE_SIGNATURE`, `UNM_PREPROD_USERNAME`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `ALLOWED_CURL_HOSTS`

### Common patterns

**Environment switching** (test/preprod):
```javascript
const ENV_CONFIG = {
  test: { baseUrl: 'https://...test...' },
  preprod: { baseUrl: 'https://...preprod...' },
};
// In the function:
const envConfig = ENV_CONFIG[options.env];
if (!envConfig) throw new Error('Invalid environment');
```

**Dry run support**:
```javascript
const isDryRun = options.dryRun === 'true' || options.dryRun === true;
if (isDryRun) {
  onLog.info(`[DRY RUN] Would update ${row.id}`);
  results.push({ ...row, status: 'DRY_RUN' });
  continue;
}
```

**Batch processing with rate limiting**:
```javascript
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(processRow));
  if (i + BATCH_SIZE < rows.length) await sleep(1000);
}
```
