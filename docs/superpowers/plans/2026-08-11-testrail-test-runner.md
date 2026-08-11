# TestRail Test Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/test-runner` page that loads a TestRail run into one editable table, records results and case edits locally, and pushes them back to TestRail on demand.

**Architecture:** A new shared TestRail client (`src/lib/testrail.js`) sits under three feature modules — pure logic (`testRunnerLogic.js`), file persistence (`testRunnerStore.js`), and orchestration (`testRunner.js`). A thin Express router exposes load/sync/save/upload, and the React page is a renderer with optimistic updates. All merge, dirty, conflict, and delta reasoning lives in the pure logic module and is unit-tested.

**Tech Stack:** Node 18+ CommonJS, Express 4, React 18.3 with react-router-dom 6, Tailwind 3.4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-testrail-test-runner-design.md`

## Global Constraints

- `src/` and `server/` are **CommonJS** (`eslint.config.js` sets `sourceType: 'commonjs'` for `**/*.js`). Use `require` / `module.exports`.
- `client/` is ESM React and is **ignored by ESLint**. Match existing client style: plain `useState` / `useEffect` / `fetch`, no data-fetching library.
- Visual tokens come from `DESIGN.md`: `gray-*` scale on light surfaces, `blue-600` accent, `rounded-xl` cards, `rounded-lg` controls, `text-sm` body, `text-xs` metadata, `lucide-react` icons, `focus-visible:ring-2 focus-visible:ring-blue-500`.
- TestRail endpoint form is `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/<endpoint>`, and query params append with `&` (e.g. `get_tests/17748&limit=250&offset=0`).
- Verified vocabulary: statuses `1 Passed, 2 Blocked, 3 Untested, 4 Retest, 5 Failed, 6 Obsolete`; priorities `1 Low, 2 Medium, 3 High, 4 Critical`. Fetch them at runtime anyway; never hardcode in logic.
- Pagination limit is `250`.
- **Do not modify** the five existing TestRail consumers: `src/services/testing/testrailAddSection.js`, `testrailUpdateCase.js`, `testrailGetSectionId.js`, `testrailUpdateSection.js`, `src/services/jira/createReport.js`, or `src/lib/automationWeb.js`.
- Test files live in `tests/`, are ESM, and import CommonJS modules via default-import interop (`import mod from '...'; const { fn } = mod;`).
- Real TestRail data for manual verification: project `184`, run `17748` (176 tests, plan `17742`, suite `12196`).
- Commit after every task.

## Plan Conventions

Backend tasks contain complete code. Client tasks contain complete code for logic-bearing pieces (status vocabulary map, search highlighting, keyboard handling, fetch wiring) and precise structural contracts — exact props, DOM shape, class strings, and states — for presentational JSX, rather than transcribing every attribute twice.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/testrail.js` (create) | Shared TestRail HTTP client: auth, pagination, retry/429, typed helpers |
| `src/lib/testRunnerLogic.js` (create) | Pure: `dirtyFields`, `isDirty`, `mergeSnapshot`, `computeDelta`, `toView` |
| `src/lib/testRunnerStore.js` (create) | Atomic per-run JSON persistence + recent-run listing |
| `src/lib/testRunner.js` (create) | Orchestration: normalize TestRail payloads, `syncRun`, `saveDraft`, `uploadRun` |
| `server/routes/testRuns.js` (create) | HTTP layer |
| `server/index.js` (modify, line 31) | Mount `/api/test-runs` |
| `.gitignore` (modify) | Ignore `server/data/testRuns/` |
| `tests/testRunnerLogic.test.js` (create) | Unit tests for the pure logic |
| `client/src/pages/TestRunner.jsx` (create) | Page: run entry, fetching, keyboard, layout |
| `client/src/components/testRunner/statusVocab.js` (create) | Status/priority display maps and shortcut keys |
| `client/src/components/testRunner/RunToolbar.jsx` (create) | Run header, counts, Sync/Upload |
| `client/src/components/testRunner/TestRunTable.jsx` (create) | Table, sorting, highlighting |
| `client/src/components/testRunner/StatusCell.jsx` (create) | Inline status buttons + overflow |
| `client/src/components/testRunner/CaseDrawer.jsx` (create) | Side drawer with case detail |
| `client/src/App.jsx` (modify, lines 6 and 58) | Import + route |
| `client/src/components/Sidebar.jsx` (modify, lines 2 and 73-76) | Nav entry |
| `package.json` (modify) | Vitest devDependency + `test` scripts |

---

### Task 1: Shared TestRail client + Vitest setup

**Files:**
- Create: `src/lib/testrail.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/lib/config.js` (`TESTRAIL_BASE_URL`, `TESTRAIL_USER`, `TESTRAIL_API_KEY`), `src/lib/sleep.js`
- Produces: `{ getRun, getTests, getStatuses, getPriorities, updateCase, addResultsForCases, TestRailError }`
  - `getRun(runId) -> Promise<object>` — raw TestRail run
  - `getTests(runId) -> Promise<object[]>` — all pages, raw TestRail tests
  - `getStatuses() -> Promise<object[]>`, `getPriorities() -> Promise<object[]>`
  - `updateCase(caseId, fields) -> Promise<object>`
  - `addResultsForCases(runId, results) -> Promise<object[]>` — `results` already in TestRail snake_case

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block, after `"lint:fix"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

No `vitest.config.js` is needed: the default include pattern (`**/*.test.js`, excluding `node_modules`) already picks up `tests/`, and the default environment is `node`. A config file would also have to be `.mjs`, since this package is CommonJS.

- [ ] **Step 3: Write `src/lib/testrail.js`**

```javascript
const config = require('./config');
const sleep = require('./sleep');

const PAGE_LIMIT = 250;
const MAX_RETRIES = 3;
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i;

class TestRailError extends Error {
  constructor(message, { status = null, endpoint = null } = {}) {
    super(message);
    this.name = 'TestRailError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

function authHeader() {
  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new TestRailError(
      'TestRail credentials missing. Set TESTRAIL_USER and TESTRAIL_API_KEY in .env'
    );
  }
  const raw = `${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function url(endpoint) {
  return `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/${endpoint}`;
}

async function request(method, endpoint, body) {
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url(endpoint), init);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && TRANSIENT.test(err.message)) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new TestRailError(`TestRail request failed: ${err.message}`, { endpoint });
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 * (attempt + 1)) * 1000);
      continue;
    }

    const text = await res.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_err) {
        payload = null;
      }
    }

    if (!res.ok) {
      const detail = (payload && payload.error) || text.slice(0, 200) || 'no response body';
      throw new TestRailError(
        `TestRail ${method} ${endpoint.split('&')[0]} failed (HTTP ${res.status}): ${detail}`,
        { status: res.status, endpoint }
      );
    }
    return payload;
  }

  throw new TestRailError(
    `TestRail ${method} ${endpoint.split('&')[0]} failed after ${MAX_RETRIES} retries: ${
      lastError ? lastError.message : 'rate limited'
    }`,
    { endpoint }
  );
}

// TestRail's bulk endpoints return { <key>: [...], offset, limit, size } on
// modern instances and a bare array on older ones. Handle both.
async function getPaginated(endpoint, key) {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = await request('GET', `${endpoint}&limit=${PAGE_LIMIT}&offset=${offset}`);
    const items = Array.isArray(page) ? page : (page && page[key]) || [];
    out.push(...items);
    if (items.length < PAGE_LIMIT) return out;
    offset += PAGE_LIMIT;
  }
}

module.exports = {
  TestRailError,
  getRun: (runId) => request('GET', `get_run/${runId}`),
  getTests: (runId) => getPaginated(`get_tests/${runId}`, 'tests'),
  getStatuses: () => request('GET', 'get_statuses'),
  getPriorities: () => request('GET', 'get_priorities'),
  updateCase: (caseId, fields) => request('POST', `update_case/${caseId}`, fields),
  addResultsForCases: (runId, results) =>
    request('POST', `add_results_for_cases/${runId}`, { results }),
};
```

- [ ] **Step 4: Verify against the live instance (read-only)**

```bash
node -e "
const tr = require('./src/lib/testrail');
(async () => {
  const run = await tr.getRun(17748);
  const tests = await tr.getTests(17748);
  const statuses = await tr.getStatuses();
  const priorities = await tr.getPriorities();
  console.log('run:', run.id, run.name);
  console.log('tests:', tests.length, 'first:', tests[0].id, tests[0].case_id, tests[0].status_id);
  console.log('statuses:', statuses.length, 'priorities:', priorities.length);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
"
```

Expected: `tests: 176`, `statuses: 6`, `priorities: 4`.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/testrail.js
git add src/lib/testrail.js package.json package-lock.json
git commit -m "Add shared TestRail API client with pagination and 429 retry"
```

---

### Task 2: Pure logic with unit tests

**Files:**
- Create: `src/lib/testRunnerLogic.js`
- Create: `tests/testRunnerLogic.test.js`
- Modify: `eslint.config.js`

**Interfaces:**
- Consumes: nothing (pure functions over plain objects)
- Produces:
  - `dirtyFields(test) -> string[]`
  - `isDirty(test) -> boolean`
  - `effectiveTitle(test) -> string`
  - `mergeSnapshot(existing|null, fresh, now?) -> { snapshot, summary }` where `summary` is `{ added, removed, removedWithDrafts: [{testId, caseId, title}], conflicts }`
  - `computeDelta(snapshot) -> { results: [{testId, caseId, statusId?, comment?}], caseEdits: [{testId, caseId, fields: {title?, priority_id?}}], skippedUntested: [{testId, caseId, title}] }`
  - `toView(snapshot) -> { run, vocab, lastSyncedAt, lastUploadedAt, tests, counts, dirtyCount, conflictCount }`
- `fresh` input shape for `mergeSnapshot`: `{ run: { runId, projectId, suiteId, planId, runName, runUrl, isCompleted, isArchived }, vocab: { statuses: [{id,label,isUntested}], priorities: [{id,label,order}] }, tests: [{ testId, caseId, order, remote: { title, statusId, priorityId, refs, preconds, steps, expected, lastResultComment } }] }`

- [ ] **Step 1: Allow ESM in `tests/`**

Insert as a new object in the `eslint.config.js` array, immediately before the final `{ ignores: [...] }` entry:

```javascript
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
```

- [ ] **Step 2: Write the failing tests**

Create `tests/testRunnerLogic.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import logicModule from '../src/lib/testRunnerLogic.js';

const { dirtyFields, isDirty, mergeSnapshot, computeDelta, toView } = logicModule;

const VOCAB = {
  statuses: [
    { id: 1, label: 'Passed', isUntested: false },
    { id: 3, label: 'Untested', isUntested: true },
    { id: 5, label: 'Failed', isUntested: false },
  ],
  priorities: [
    { id: 2, label: 'Medium', order: 2 },
    { id: 4, label: 'Critical', order: 4 },
  ],
};

const RUN = {
  runId: 17748,
  projectId: 184,
  suiteId: 12196,
  planId: 17742,
  runName: 'Sample run',
  runUrl: 'https://tiket.testrail.com/index.php?/runs/view/17748',
  isCompleted: false,
  isArchived: false,
};

function freshTest(overrides = {}) {
  return {
    testId: 1001,
    caseId: 2001,
    order: 0,
    remote: {
      title: 'success login',
      statusId: 3,
      priorityId: 2,
      refs: 'PLAT-1',
      preconds: null,
      steps: '<ol><li>open</li></ol>',
      expected: '<p>ok</p>',
      lastResultComment: null,
    },
    ...overrides,
  };
}

function fresh(tests = [freshTest()]) {
  return { run: RUN, vocab: VOCAB, tests };
}

function storedTest(overrides = {}) {
  const base = freshTest();
  return { ...base, caseTitle: null, draft: {}, conflicts: [], uploadError: null, ...overrides };
}

function snapshot(tests = [storedTest()]) {
  const map = {};
  for (const test of tests) map[String(test.testId)] = test;
  return { ...RUN, lastSyncedAt: '2026-08-11T00:00:00.000Z', lastUploadedAt: null, vocab: VOCAB, tests: map };
}

describe('dirtyFields', () => {
  it('reports nothing for an untouched test', () => {
    expect(dirtyFields(storedTest())).toEqual([]);
  });

  it('reports a status draft that differs from remote', () => {
    expect(dirtyFields(storedTest({ draft: { statusId: 1 } }))).toEqual(['statusId']);
  });

  it('ignores a status draft equal to remote', () => {
    expect(dirtyFields(storedTest({ draft: { statusId: 3 } }))).toEqual([]);
  });

  it('treats any non-empty comment as dirty', () => {
    expect(dirtyFields(storedTest({ draft: { comment: 'note' } }))).toEqual(['comment']);
  });

  it('ignores a whitespace-only comment', () => {
    expect(dirtyFields(storedTest({ draft: { comment: '   ' } }))).toEqual([]);
  });

  it('compares a title draft against caseTitle when one exists', () => {
    const test = storedTest({ caseTitle: 'success login via email', draft: { title: 'success login via email' } });
    expect(dirtyFields(test)).toEqual([]);
    expect(isDirty(test)).toBe(false);
  });
});

describe('mergeSnapshot', () => {
  it('creates a snapshot from scratch when nothing is stored', () => {
    const { snapshot: merged, summary } = mergeSnapshot(null, fresh());
    expect(summary.added).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(merged.tests['1001'].draft).toEqual({});
    expect(merged.tests['1001'].caseTitle).toBeNull();
    expect(merged.runName).toBe('Sample run');
  });

  it('preserves drafts across a sync', () => {
    const existing = snapshot([storedTest({ draft: { statusId: 1, comment: 'note' } })]);
    const { snapshot: merged } = mergeSnapshot(existing, fresh());
    expect(merged.tests['1001'].draft).toEqual({ statusId: 1, comment: 'note' });
  });

  it('flags a conflict when remote moved under a drafted field', () => {
    const existing = snapshot([storedTest({ draft: { statusId: 1 } })]);
    const incoming = fresh([freshTest({ remote: { ...freshTest().remote, statusId: 5 } })]);
    const { snapshot: merged, summary } = mergeSnapshot(existing, incoming, '2026-08-11T01:00:00.000Z');
    expect(summary.conflicts).toBe(1);
    expect(merged.tests['1001'].conflicts).toEqual([
      { field: 'statusId', mine: 1, theirs: 5, detectedAt: '2026-08-11T01:00:00.000Z' },
    ]);
  });

  it('does not flag a conflict when the field was never drafted', () => {
    const existing = snapshot([storedTest()]);
    const incoming = fresh([freshTest({ remote: { ...freshTest().remote, statusId: 5 } })]);
    const { snapshot: merged, summary } = mergeSnapshot(existing, incoming);
    expect(summary.conflicts).toBe(0);
    expect(merged.tests['1001'].remote.statusId).toBe(5);
  });

  it('carries caseTitle and lastResultComment forward', () => {
    const existing = snapshot([
      storedTest({ caseTitle: 'renamed', remote: { ...storedTest().remote, lastResultComment: 'shipped' } }),
    ]);
    const { snapshot: merged } = mergeSnapshot(existing, fresh());
    expect(merged.tests['1001'].caseTitle).toBe('renamed');
    expect(merged.tests['1001'].remote.lastResultComment).toBe('shipped');
  });

  it('reports removed tests that still had drafts', () => {
    const existing = snapshot([
      storedTest(),
      storedTest({ testId: 1002, caseId: 2002, draft: { statusId: 1 } }),
    ]);
    const { snapshot: merged, summary } = mergeSnapshot(existing, fresh());
    expect(summary.removed).toBe(1);
    expect(summary.removedWithDrafts).toEqual([
      { testId: 1002, caseId: 2002, title: 'success login' },
    ]);
    expect(merged.tests['1002']).toBeUndefined();
  });

  it('counts newly added tests', () => {
    const existing = snapshot([storedTest()]);
    const incoming = fresh([freshTest(), freshTest({ testId: 1003, caseId: 2003, order: 1 })]);
    const { summary } = mergeSnapshot(existing, incoming);
    expect(summary.added).toBe(1);
  });
});

describe('computeDelta', () => {
  it('returns nothing when no drafts exist', () => {
    expect(computeDelta(snapshot())).toEqual({ results: [], caseEdits: [], skippedUntested: [] });
  });

  it('pushes a changed status', () => {
    const delta = computeDelta(snapshot([storedTest({ draft: { statusId: 1 } })]));
    expect(delta.results).toEqual([{ testId: 1001, caseId: 2001, statusId: 1 }]);
  });

  it('pushes a comment with no status change', () => {
    const delta = computeDelta(snapshot([storedTest({ draft: { comment: 'flaky' } })]));
    expect(delta.results).toEqual([{ testId: 1001, caseId: 2001, comment: 'flaky' }]);
  });

  it('skips a draft status of Untested but still pushes its comment', () => {
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 1 },
      draft: { statusId: 3, comment: 'needs redo' },
    });
    const delta = computeDelta(snapshot([stored]));
    expect(delta.skippedUntested).toEqual([{ testId: 1001, caseId: 2001, title: 'success login' }]);
    expect(delta.results).toEqual([{ testId: 1001, caseId: 2001, comment: 'needs redo' }]);
  });

  it('groups title and priority into one case edit', () => {
    const delta = computeDelta(
      snapshot([storedTest({ draft: { title: 'success login via email', priorityId: 4 } })])
    );
    expect(delta.caseEdits).toEqual([
      { testId: 1001, caseId: 2001, fields: { title: 'success login via email', priority_id: 4 } },
    ]);
    expect(delta.results).toEqual([]);
  });
});

describe('toView', () => {
  it('projects rows in run order with effective values and no case HTML', () => {
    const view = toView(
      snapshot([
        storedTest({ order: 1, testId: 1002, caseId: 2002 }),
        storedTest({ draft: { statusId: 1, comment: 'ok' } }),
      ])
    );
    expect(view.tests.map((t) => t.testId)).toEqual([1001, 1002]);
    expect(view.tests[0].statusId).toBe(1);
    expect(view.tests[0].remoteStatusId).toBe(3);
    expect(view.tests[0].dirtyFields).toEqual(['statusId', 'comment']);
    expect(view.tests[0].steps).toBeUndefined();
    expect(view.dirtyCount).toBe(1);
    expect(view.counts).toEqual({ 3: 2 });
  });

  it('marks a row whose case title diverged from the run copy', () => {
    const view = toView(snapshot([storedTest({ caseTitle: 'renamed in case' })]));
    expect(view.tests[0].title).toBe('renamed in case');
    expect(view.tests[0].titleDivergedFromRun).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/lib/testRunnerLogic.js'`.

- [ ] **Step 4: Write `src/lib/testRunnerLogic.js`**

```javascript
const EDITABLE_FIELDS = ['statusId', 'priorityId', 'title'];

function baseTitle(test) {
  return test.caseTitle == null ? test.remote.title : test.caseTitle;
}

function effectiveTitle(test) {
  const draft = test.draft || {};
  return 'title' in draft ? draft.title : baseTitle(test);
}

function draftComment(test) {
  const value = (test.draft || {}).comment;
  return typeof value === 'string' ? value.trim() : '';
}

function dirtyFields(test) {
  const draft = test.draft || {};
  const fields = [];
  if ('statusId' in draft && draft.statusId !== test.remote.statusId) fields.push('statusId');
  if ('priorityId' in draft && draft.priorityId !== test.remote.priorityId) fields.push('priorityId');
  if ('title' in draft && draft.title !== baseTitle(test)) fields.push('title');
  if (draftComment(test)) fields.push('comment');
  return fields;
}

function isDirty(test) {
  return dirtyFields(test).length > 0;
}

function mergeSnapshot(existing, fresh, now = new Date().toISOString()) {
  const prevTests = (existing && existing.tests) || {};
  const tests = {};
  const summary = { added: 0, removed: 0, removedWithDrafts: [], conflicts: 0 };

  for (const incoming of fresh.tests) {
    const key = String(incoming.testId);
    const prev = prevTests[key];

    if (!prev) {
      tests[key] = { ...incoming, caseTitle: null, draft: {}, conflicts: [], uploadError: null };
      summary.added += 1;
      continue;
    }

    const draft = { ...(prev.draft || {}) };
    const conflicts = [];
    for (const field of EDITABLE_FIELDS) {
      if (!(field in draft)) continue;
      if (prev.remote[field] !== incoming.remote[field]) {
        conflicts.push({ field, mine: draft[field], theirs: incoming.remote[field], detectedAt: now });
      }
    }
    summary.conflicts += conflicts.length;

    tests[key] = {
      ...incoming,
      remote: {
        ...incoming.remote,
        lastResultComment: (prev.remote && prev.remote.lastResultComment) || null,
      },
      caseTitle: prev.caseTitle == null ? null : prev.caseTitle,
      draft,
      conflicts,
      uploadError: prev.uploadError || null,
    };
  }

  for (const [key, prev] of Object.entries(prevTests)) {
    if (tests[key]) continue;
    summary.removed += 1;
    if (isDirty(prev)) {
      summary.removedWithDrafts.push({
        testId: prev.testId,
        caseId: prev.caseId,
        title: effectiveTitle(prev),
      });
    }
  }

  const snapshot = {
    ...fresh.run,
    lastSyncedAt: now,
    lastUploadedAt: (existing && existing.lastUploadedAt) || null,
    vocab: fresh.vocab,
    tests,
  };

  return { snapshot, summary };
}

function untestedStatusId(snapshot) {
  const statuses = (snapshot.vocab && snapshot.vocab.statuses) || [];
  const found = statuses.find((status) => status.isUntested);
  return found ? found.id : 3;
}

function computeDelta(snapshot) {
  const results = [];
  const caseEdits = [];
  const skippedUntested = [];
  const untested = untestedStatusId(snapshot);

  for (const test of Object.values(snapshot.tests)) {
    const draft = test.draft || {};
    const comment = draftComment(test);
    let pushStatus = 'statusId' in draft && draft.statusId !== test.remote.statusId;

    if (pushStatus && draft.statusId === untested) {
      skippedUntested.push({ testId: test.testId, caseId: test.caseId, title: effectiveTitle(test) });
      pushStatus = false;
    }

    if (pushStatus || comment) {
      const entry = { testId: test.testId, caseId: test.caseId };
      if (pushStatus) entry.statusId = draft.statusId;
      if (comment) entry.comment = comment;
      results.push(entry);
    }

    const fields = {};
    if ('title' in draft && draft.title !== baseTitle(test)) fields.title = draft.title;
    if ('priorityId' in draft && draft.priorityId !== test.remote.priorityId) {
      fields.priority_id = draft.priorityId;
    }
    if (Object.keys(fields).length > 0) {
      caseEdits.push({ testId: test.testId, caseId: test.caseId, fields });
    }
  }

  return { results, caseEdits, skippedUntested };
}

function toView(snapshot) {
  const tests = Object.values(snapshot.tests)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((test) => {
      const draft = test.draft || {};
      return {
        testId: test.testId,
        caseId: test.caseId,
        title: effectiveTitle(test),
        statusId: 'statusId' in draft ? draft.statusId : test.remote.statusId,
        remoteStatusId: test.remote.statusId,
        priorityId: 'priorityId' in draft ? draft.priorityId : test.remote.priorityId,
        comment: typeof draft.comment === 'string' ? draft.comment : '',
        refs: test.remote.refs || null,
        dirtyFields: dirtyFields(test),
        conflicts: test.conflicts || [],
        uploadError: test.uploadError || null,
        titleDivergedFromRun: Boolean(test.caseTitle && test.caseTitle !== test.remote.title),
        lastResultComment: test.remote.lastResultComment || null,
      };
    });

  const counts = {};
  for (const test of tests) {
    counts[test.remoteStatusId] = (counts[test.remoteStatusId] || 0) + 1;
  }

  return {
    run: {
      runId: snapshot.runId,
      projectId: snapshot.projectId,
      suiteId: snapshot.suiteId,
      planId: snapshot.planId,
      runName: snapshot.runName,
      runUrl: snapshot.runUrl,
      isCompleted: snapshot.isCompleted,
      isArchived: snapshot.isArchived,
    },
    vocab: snapshot.vocab,
    lastSyncedAt: snapshot.lastSyncedAt,
    lastUploadedAt: snapshot.lastUploadedAt,
    tests,
    counts,
    dirtyCount: tests.filter((test) => test.dirtyFields.length > 0).length,
    conflictCount: tests.filter((test) => test.conflicts.length > 0).length,
  };
}

module.exports = {
  dirtyFields,
  isDirty,
  effectiveTitle,
  mergeSnapshot,
  computeDelta,
  toView,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, 20 tests across 4 suites.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/lib/testRunnerLogic.js tests/testRunnerLogic.test.js eslint.config.js
git add src/lib/testRunnerLogic.js tests/testRunnerLogic.test.js eslint.config.js package.json package-lock.json
git commit -m "Add tested merge, delta, and view logic for the test runner"
```

---

### Task 3: Persistence and orchestration

**Files:**
- Create: `src/lib/testRunnerStore.js`
- Create: `src/lib/testRunner.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `src/lib/testrail.js`, `src/lib/testRunnerLogic.js`, `src/lib/sleep.js`
- Produces from `testRunnerStore.js`: `{ readSnapshot(runId), writeSnapshot(runId, snapshot), listSnapshots() }`
- Produces from `testRunner.js`:
  - `loadRun(runId) -> view|null`
  - `syncRun(runId) -> { state: view, summary }`
  - `saveDraft(runId, testId, patch) -> view` — `patch` keys `statusId|priorityId|title|comment`, a `null` value clears that draft key
  - `uploadRun(runId) -> outcome` where `outcome` is `{ pushed, resultsFailed, casesUpdated, casesFailed, skippedUntested, errors }`
  - `getCaseDetail(runId, testId) -> { preconds, steps, expected, refs, caseId, runTitle, caseTitle }`
  - `listRecentRuns() -> [{ runId, runName, lastSyncedAt, dirtyCount }]`
  - `parseRunId(input) -> number|null`

- [ ] **Step 1: Ignore the snapshot directory**

Append to the "Data files" block in `.gitignore`:

```
# ─── Test runner snapshots (working state) ────
server/data/testRuns/
```

- [ ] **Step 2: Write `src/lib/testRunnerStore.js`**

```javascript
const fs = require('fs');
const path = require('path');
const logic = require('./testRunnerLogic');

const DATA_DIR = path.join(__dirname, '../../server/data/testRuns');

function snapshotPath(runId) {
  return path.join(DATA_DIR, `${Number(runId)}.json`);
}

function readSnapshot(runId) {
  const file = snapshotPath(runId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Written tmp-then-rename so a crash mid-write cannot corrupt existing drafts.
function writeSnapshot(runId, snapshot) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = snapshotPath(runId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function listSnapshots(limit = 8) {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => {
      try {
        const snapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
        return {
          runId: snapshot.runId,
          runName: snapshot.runName,
          lastSyncedAt: snapshot.lastSyncedAt,
          dirtyCount: Object.values(snapshot.tests || {}).filter(logic.isDirty).length,
        };
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastSyncedAt).localeCompare(String(a.lastSyncedAt)))
    .slice(0, limit);
}

module.exports = { readSnapshot, writeSnapshot, listSnapshots, snapshotPath };
```

- [ ] **Step 3: Write `src/lib/testRunner.js`**

```javascript
const testrail = require('./testrail');
const logic = require('./testRunnerLogic');
const store = require('./testRunnerStore');
const sleep = require('./sleep');

const CASE_EDIT_CONCURRENCY = 5;
const CASE_EDIT_PAUSE_MS = 250;
const RESULT_CHUNK = 250;
const MAX_TITLE = 250;
const MAX_COMMENT = 5000;

function parseRunId(input) {
  if (input == null) return null;
  const text = String(input).trim();
  const fromUrl = text.match(/\/runs\/view\/(\d+)/);
  const digits = fromUrl ? fromUrl[1] : text.match(/^\d+$/) && text;
  const runId = Number(digits);
  return Number.isInteger(runId) && runId > 0 ? runId : null;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeVocab(statuses, priorities) {
  return {
    statuses: statuses.map((status) => ({
      id: status.id,
      label: status.label || status.name,
      isUntested: Boolean(status.is_untested),
      isSystem: Boolean(status.is_system),
    })),
    priorities: priorities
      .map((priority) => ({ id: priority.id, label: priority.name, order: priority.priority }))
      .sort((a, b) => a.order - b.order),
  };
}

function normalizeTest(test, index) {
  return {
    testId: test.id,
    caseId: test.case_id,
    order: index,
    remote: {
      title: test.title,
      statusId: test.status_id,
      priorityId: test.priority_id,
      refs: test.refs || null,
      preconds: test.custom_preconds || null,
      steps: test.custom_steps || null,
      expected: test.custom_expected || null,
      lastResultComment: null,
    },
  };
}

function loadRun(runId) {
  const snapshot = store.readSnapshot(runId);
  return snapshot ? logic.toView(snapshot) : null;
}

async function syncRun(runId) {
  const run = await testrail.getRun(runId);
  const [rawTests, statuses, priorities] = await Promise.all([
    testrail.getTests(runId),
    testrail.getStatuses(),
    testrail.getPriorities(),
  ]);

  const fresh = {
    run: {
      runId: run.id,
      projectId: run.project_id,
      suiteId: run.suite_id,
      planId: run.plan_id || null,
      runName: run.name,
      runUrl: run.url,
      isCompleted: Boolean(run.is_completed),
      isArchived: Boolean(run.is_archived),
    },
    vocab: normalizeVocab(statuses, priorities),
    tests: rawTests.map(normalizeTest),
  };

  const existing = store.readSnapshot(runId);
  const { snapshot, summary } = logic.mergeSnapshot(existing, fresh);
  store.writeSnapshot(runId, snapshot);
  return { state: logic.toView(snapshot), summary };
}

function validatePatch(snapshot, patch) {
  const statusIds = snapshot.vocab.statuses.map((status) => status.id);
  const priorityIds = snapshot.vocab.priorities.map((priority) => priority.id);

  for (const [field, value] of Object.entries(patch)) {
    if (value === null) continue;
    if (field === 'statusId') {
      if (!statusIds.includes(value)) throw new Error(`Unknown status id: ${value}`);
    } else if (field === 'priorityId') {
      if (!priorityIds.includes(value)) throw new Error(`Unknown priority id: ${value}`);
    } else if (field === 'title') {
      if (typeof value !== 'string' || value.trim() === '') throw new Error('Title cannot be empty');
      if (value.length > MAX_TITLE) throw new Error(`Title exceeds ${MAX_TITLE} characters`);
    } else if (field === 'comment') {
      if (typeof value !== 'string') throw new Error('Comment must be text');
      if (value.length > MAX_COMMENT) throw new Error(`Comment exceeds ${MAX_COMMENT} characters`);
    } else {
      throw new Error(`Unknown field: ${field}`);
    }
  }
}

// Read-modify-write is synchronous with no await in between, so concurrent
// requests in this single-threaded process cannot interleave.
function saveDraft(runId, testId, patch) {
  const snapshot = store.readSnapshot(runId);
  if (!snapshot) throw new Error(`Run ${runId} has not been synced yet`);
  const test = snapshot.tests[String(testId)];
  if (!test) throw new Error(`Test ${testId} is not part of run ${runId}`);

  validatePatch(snapshot, patch);

  const draft = { ...(test.draft || {}) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete draft[field];
    else draft[field] = field === 'title' ? value.trim() : value;
  }

  test.draft = draft;
  test.uploadError = null;
  test.conflicts = (test.conflicts || []).filter((conflict) => !(conflict.field in patch));

  store.writeSnapshot(runId, snapshot);
  return logic.toView(snapshot);
}

async function uploadRun(runId) {
  const snapshot = store.readSnapshot(runId);
  if (!snapshot) throw new Error(`Run ${runId} has not been synced yet`);

  const delta = logic.computeDelta(snapshot);
  const outcome = {
    pushed: 0,
    resultsFailed: 0,
    casesUpdated: 0,
    casesFailed: 0,
    skippedUntested: delta.skippedUntested,
    errors: [],
  };

  for (const item of [...delta.results, ...delta.caseEdits]) {
    snapshot.tests[String(item.testId)].uploadError = null;
  }

  if (delta.results.length > 0) {
    if (snapshot.isCompleted || snapshot.isArchived) {
      outcome.resultsFailed = delta.results.length;
      outcome.errors.push(
        'Run is completed or archived, so TestRail rejects new results. Reopen the run in TestRail to upload them.'
      );
    } else {
      for (const batch of chunk(delta.results, RESULT_CHUNK)) {
        const payload = batch.map((result) => {
          const entry = { case_id: result.caseId };
          if ('statusId' in result) entry.status_id = result.statusId;
          if ('comment' in result) entry.comment = result.comment;
          return entry;
        });
        try {
          await testrail.addResultsForCases(runId, payload);
          for (const result of batch) {
            const test = snapshot.tests[String(result.testId)];
            if ('statusId' in result) {
              test.remote.statusId = result.statusId;
              delete test.draft.statusId;
            }
            if ('comment' in result) {
              test.remote.lastResultComment = result.comment;
              delete test.draft.comment;
            }
            outcome.pushed += 1;
          }
        } catch (err) {
          for (const result of batch) {
            snapshot.tests[String(result.testId)].uploadError = err.message;
            outcome.resultsFailed += 1;
          }
          outcome.errors.push(err.message);
        }
      }
    }
  }

  const caseGroups = chunk(delta.caseEdits, CASE_EDIT_CONCURRENCY);
  for (let i = 0; i < caseGroups.length; i++) {
    await Promise.all(
      caseGroups[i].map(async (edit) => {
        const test = snapshot.tests[String(edit.testId)];
        try {
          await testrail.updateCase(edit.caseId, edit.fields);
          if ('title' in edit.fields) {
            test.caseTitle = edit.fields.title;
            delete test.draft.title;
          }
          if ('priority_id' in edit.fields) {
            test.remote.priorityId = edit.fields.priority_id;
            delete test.draft.priorityId;
          }
          outcome.casesUpdated += 1;
        } catch (err) {
          test.uploadError = err.message;
          outcome.casesFailed += 1;
          outcome.errors.push(err.message);
        }
      })
    );
    if (i < caseGroups.length - 1) await sleep(CASE_EDIT_PAUSE_MS);
  }

  snapshot.lastUploadedAt = new Date().toISOString();
  store.writeSnapshot(runId, snapshot);
  return outcome;
}

function getCaseDetail(runId, testId) {
  const snapshot = store.readSnapshot(runId);
  if (!snapshot) throw new Error(`Run ${runId} has not been synced yet`);
  const test = snapshot.tests[String(testId)];
  if (!test) throw new Error(`Test ${testId} is not part of run ${runId}`);
  return {
    testId: test.testId,
    caseId: test.caseId,
    runTitle: test.remote.title,
    caseTitle: test.caseTitle,
    refs: test.remote.refs,
    preconds: test.remote.preconds,
    steps: test.remote.steps,
    expected: test.remote.expected,
    lastResultComment: test.remote.lastResultComment,
  };
}

module.exports = {
  parseRunId,
  loadRun,
  syncRun,
  saveDraft,
  uploadRun,
  getCaseDetail,
  listRecentRuns: () => store.listSnapshots(),
};
```

- [ ] **Step 4: Verify sync against the real run**

```bash
node -e "
const runner = require('./src/lib/testRunner');
(async () => {
  console.log('parse url:', runner.parseRunId('https://tiket.testrail.com/index.php?/runs/view/17748'));
  console.log('parse id:', runner.parseRunId(' 17748 '));
  console.log('parse junk:', runner.parseRunId('nope'));
  const first = await runner.syncRun(17748);
  console.log('tests:', first.state.tests.length, 'summary:', first.summary);
  runner.saveDraft(17748, first.state.tests[0].testId, { comment: 'plan smoke test' });
  const second = await runner.syncRun(17748);
  const row = second.state.tests.find((t) => t.testId === first.state.tests[0].testId);
  console.log('draft survived resync:', row.comment === 'plan smoke test', 'dirty:', second.state.dirtyCount);
  console.log('detail keys:', Object.keys(runner.getCaseDetail(17748, row.testId)));
  console.log('recent:', runner.listRecentRuns());
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
"
```

Expected: `tests: 176`, `draft survived resync: true`, `dirty: 1`, one recent run listed. Then clear the smoke draft:

```bash
node -e "require('./src/lib/testRunner').saveDraft(17748, Number(process.argv[1]), { comment: null })" <testId>
```

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/lib/testRunnerStore.js src/lib/testRunner.js
git add src/lib/testRunnerStore.js src/lib/testRunner.js .gitignore
git commit -m "Add snapshot persistence and TestRail sync/upload orchestration"
```

---

### Task 4: Server routes

**Files:**
- Create: `server/routes/testRuns.js`
- Modify: `server/index.js` (line 31)

**Interfaces:**
- Consumes: `src/lib/testRunner.js` (`parseRunId`, `loadRun`, `syncRun`, `saveDraft`, `uploadRun`, `getCaseDetail`, `listRecentRuns`)
- Produces HTTP: `GET /api/test-runs`, `GET /api/test-runs/:runId`, `POST /api/test-runs/:runId/sync`, `PATCH /api/test-runs/:runId/tests/:testId`, `GET /api/test-runs/:runId/tests/:testId`, `POST /api/test-runs/:runId/upload`

- [ ] **Step 1: Write `server/routes/testRuns.js`**

```javascript
const express = require('express');
const router = express.Router();
const runner = require('../../src/lib/testRunner');

function resolveRunId(req, res) {
  const runId = runner.parseRunId(req.params.runId);
  if (!runId) {
    res.status(400).json({ error: `Invalid run id: ${req.params.runId}` });
    return null;
  }
  return runId;
}

router.get('/', (req, res) => {
  try {
    res.json({ runs: runner.listRecentRuns() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:runId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const state = runner.loadRun(runId);
    if (!state) {
      return res.status(404).json({ error: `Run ${runId} has not been synced yet`, runId });
    }
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:runId/sync', async (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const { state, summary } = await runner.syncRun(runId);
    res.json({ ...state, summary });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.patch('/:runId/tests/:testId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  const testId = Number(req.params.testId);
  if (!Number.isInteger(testId)) {
    return res.status(400).json({ error: `Invalid test id: ${req.params.testId}` });
  }
  const patch = req.body || {};
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No fields supplied' });
  }
  try {
    res.json(runner.saveDraft(runId, testId, patch));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:runId/tests/:testId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    res.json(runner.getCaseDetail(runId, Number(req.params.testId)));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/:runId/upload', async (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const outcome = await runner.uploadRun(runId);
    const { state } = await runner.syncRun(runId);
    res.json({ outcome, state });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router**

In `server/index.js`, after line 31 (`app.use('/api/automation-web', ...)`):

```javascript
app.use('/api/test-runs', require('./routes/testRuns'));
```

- [ ] **Step 3: Verify the endpoints**

Start the server (`npm run dev:server`), then in another shell:

```bash
curl -s localhost:3456/api/test-runs | head -c 300; echo
curl -s localhost:3456/api/test-runs/17748 | head -c 200; echo
curl -s -X POST localhost:3456/api/test-runs/17748/sync | head -c 200; echo
curl -s localhost:3456/api/test-runs/abc | head -c 200; echo
```

Expected: recent runs list; run state JSON; sync returns state with `summary`; `abc` returns `{"error":"Invalid run id: abc"}`.

- [ ] **Step 4: Lint and commit**

```bash
npx eslint server/routes/testRuns.js server/index.js
git add server/routes/testRuns.js server/index.js
git commit -m "Expose test runner load, sync, draft, and upload endpoints"
```

---

### Task 5: Page shell, navigation, and read-only table

**Files:**
- Create: `client/src/components/testRunner/statusVocab.js`
- Create: `client/src/components/testRunner/RunToolbar.jsx`
- Create: `client/src/components/testRunner/TestRunTable.jsx`
- Create: `client/src/pages/TestRunner.jsx`
- Modify: `client/src/App.jsx` (lines 6, 58)
- Modify: `client/src/components/Sidebar.jsx` (lines 2, 73-76)

**Interfaces:**
- Consumes: `GET /api/test-runs`, `GET /api/test-runs/:runId`, `POST /api/test-runs/:runId/sync`
- Produces:
  - `statusVocab.js`: `STATUS_STYLES` (id-keyed `{ label, pill, dot }`), `QUICK_STATUS_IDS = [1, 5, 2, 4]`, `SHORTCUT_TO_STATUS = { p: 1, f: 5, b: 2, r: 4 }`, `statusLabel(vocab, id)`, `priorityLabel(vocab, id)`
  - `RunToolbar({ run, counts, vocab, lastSyncedAt, dirtyCount, syncing, uploading, onSync, onUpload })`
  - `TestRunTable({ tests, vocab, sort, onSortChange, query, activeTestId, focusedTestId, onRowClick, onPatch, readOnlyResults })`
  - `TestRunner()` default export

- [ ] **Step 1: Write `client/src/components/testRunner/statusVocab.js`**

```javascript
export const STATUS_STYLES = {
  1: { label: 'Passed', pill: 'border-green-200 bg-green-50 text-green-800', dot: 'bg-green-500' },
  2: { label: 'Blocked', pill: 'border-amber-200 bg-amber-50 text-amber-900', dot: 'bg-amber-500' },
  3: { label: 'Untested', pill: 'border-gray-200 bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  4: { label: 'Retest', pill: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-500' },
  5: { label: 'Failed', pill: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500' },
  6: { label: 'Obsolete', pill: 'border-gray-300 bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
};

const FALLBACK_STYLE = { label: 'Unknown', pill: 'border-gray-200 bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

export const QUICK_STATUS_IDS = [1, 5, 2, 4];

export const SHORTCUT_TO_STATUS = { p: 1, f: 5, b: 2, r: 4 };

export function statusStyle(id) {
  return STATUS_STYLES[id] || FALLBACK_STYLE;
}

export function statusLabel(vocab, id) {
  const found = (vocab?.statuses || []).find((status) => status.id === id);
  return found ? found.label : statusStyle(id).label;
}

export function priorityLabel(vocab, id) {
  const found = (vocab?.priorities || []).find((priority) => priority.id === id);
  return found ? found.label : String(id);
}
```

- [ ] **Step 2: Write `client/src/components/testRunner/RunToolbar.jsx`**

Structure: a `rounded-xl border border-gray-200 bg-white p-5` card containing two rows.

Row one — run identity: run name as an `<a href={run.runUrl} target="_blank" rel="noreferrer">` in `text-base font-semibold text-gray-900 hover:text-blue-700` with an `ExternalLink` icon at 14px; beneath it a `text-xs text-gray-500` line reading `Run <runId> · Project <projectId>` plus `· Plan <planId>` when `run.planId` is set.

Row two — actions, `flex items-center justify-between gap-4`:
- Left: status counts from `counts`, one pill per status present, using `statusStyle(id).pill` with class `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium`, label from `statusLabel(vocab, id)`, ordered by `QUICK_STATUS_IDS` then remaining ids ascending.
- Right: Sync then Upload.
  - Sync: secondary button (`border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2 text-sm font-semibold`), `RefreshCw` icon 16px with `animate-spin` while `syncing`, label `Sync`, and a `text-xs text-gray-500` sibling showing `Synced ${relativeTime(lastSyncedAt)}`.
  - Upload: primary button (`bg-blue-600 text-white hover:bg-blue-700 shadow-sm rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-gray-300`), `UploadCloud` icon 16px with `animate-spin` on `Loader2` while `uploading`, label `Upload ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` or plain `Upload` at zero, `disabled={dirtyCount === 0 || uploading || syncing}`.

Include this helper in the file:

```javascript
function relativeTime(iso) {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

- [ ] **Step 3: Write `client/src/components/testRunner/TestRunTable.jsx` (read-only pass)**

This step renders values only; Task 6 adds editing. Include the highlight helper now, since Task 7 needs it:

```javascript
export function Highlight({ text, query }) {
  if (!query || !text) return text || '';
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  const parts = [];
  let cursor = 0;
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark key={found} className="rounded bg-amber-100 px-0.5 text-amber-900">
        {text.slice(found, found + query.length)}
      </mark>
    );
    cursor = found + query.length;
  }
  return <>{parts}</>;
}
```

Table structure: wrapper `overflow-hidden rounded-xl border border-gray-200 bg-white`, inner `overflow-x-auto`, `<table className="w-full text-left text-sm">`.

`<thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500">` with six `<th className="whitespace-nowrap px-4 py-2.5 font-medium">` cells: `Test ID`, `Test Name`, `Priority`, `Status`, `Latest TestRail`, `Comments`. Each header is a `<button type="button">` calling `onSortChange(key)` for keys `caseId`, `title`, `priorityId`, `statusId`, `remoteStatusId`, and shows `ChevronUp` / `ChevronDown` at 12px when `sort.key` matches.

`<tbody className="divide-y divide-gray-100">`, one `<tr>` per test with:
- `className` composed as: base `cursor-pointer transition-colors`, plus `bg-blue-50/60` when `test.testId === activeTestId`, else `hover:bg-gray-50`; plus `ring-1 ring-inset ring-blue-400` when `test.testId === focusedTestId`; plus `border-l-2 border-l-blue-500` when `test.dirtyFields.length > 0`, `border-l-2 border-l-amber-500` when `test.conflicts.length > 0`, `border-l-2 border-l-red-500` when `test.uploadError`.
- `onClick={() => onRowClick(test.testId)}`.
- Cell 1: `<a>` to `https://tiket.testrail.com/index.php?/cases/view/${test.caseId}` in `font-mono text-xs text-blue-700 hover:underline`, text `C${test.caseId}`, `onClick` stopping propagation.
- Cell 2: `<Highlight text={test.title} query={query} />` in `text-gray-800`; when `test.titleDivergedFromRun`, append an `Info` icon at 12px in `text-gray-400` with `title="Case renamed. TestRail's run view keeps the original title until a new run is created."`.
- Cell 3: `priorityLabel(vocab, test.priorityId)`, `text-gray-700` and `font-medium text-gray-900` for ids 3 and 4.
- Cell 4: status pill via `statusStyle(test.statusId)`.
- Cell 5: status pill via `statusStyle(test.remoteStatusId)`, muted with `opacity-70`.
- Cell 6: `test.comment` truncated with `line-clamp-1 text-gray-600`, or `<span className="text-gray-400">—</span>` when empty.

Sorting is applied by the parent, not here.

- [ ] **Step 4: Write `client/src/pages/TestRunner.jsx`**

State: `runInput`, `runId`, `state`, `recent`, `loading`, `syncing`, `error`, `notice`, `sort` (`{ key: 'order', dir: 'asc' }`), `query`, `activeTestId`, `focusedTestId`.

```javascript
const API = '/api/test-runs';

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  return body;
}

function parseRunInput(input) {
  const text = String(input || '').trim();
  const fromUrl = text.match(/\/runs\/view\/(\d+)/);
  if (fromUrl) return Number(fromUrl[1]);
  return /^\d+$/.test(text) ? Number(text) : null;
}
```

Behavior:
- On mount, `json(API)` populates `recent`.
- `openRun(id)`: set `runId`, `loading` true, `json(`${API}/${id}`)`; on a 404 error message, immediately call `syncRun(id)`; store result in `state`.
- `syncRun(id)`: `syncing` true, `POST ${API}/${id}/sync`, set `state`, and if `summary.removedWithDrafts.length` set `notice` to `${n} test(s) you edited are no longer in this run: ${titles}`.
- Sorted rows via `useMemo`: default `order` uses the server array order; other keys compare numerically for `caseId`, `priorityId`, `statusId`, `remoteStatusId` and with `localeCompare` for `title`, reversed when `sort.dir === 'desc'`.

Layout: `<h1 className="text-2xl font-bold text-gray-900">Test Runner</h1>` with a `mt-1 text-sm text-gray-500` subtitle "Execute a TestRail run without leaving one screen." Below, when no run is open, a `rounded-xl border border-gray-200 bg-white p-5` card with a labelled text input (`rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500`, placeholder `17748 or https://tiket.testrail.com/index.php?/runs/view/17748`), a primary `Open run` submit button disabled when `parseRunInput` returns null, and the `recent` chips as buttons (`rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100`) labelled `${runId} · ${runName}` with a `text-blue-700` suffix `${dirtyCount} unsaved` when non-zero.

Error and notice banners follow `DESIGN.md`: `rounded-lg border p-4 text-sm` with `border-red-200 bg-red-50 text-red-800` and `border-amber-200 bg-amber-50 text-amber-800`.

- [ ] **Step 5: Wire the route**

`client/src/App.jsx` line 6 area:

```javascript
import TestRunner from './pages/TestRunner';
```

After line 58 (`<Route path="/automation-web" ... />`):

```jsx
          <Route path="/test-runner" element={<TestRunner />} />
```

- [ ] **Step 6: Wire the sidebar**

In `client/src/components/Sidebar.jsx`, add `ClipboardCheck` to the line 2 import, and after the Automation WEB `NavLink` (line 76):

```jsx
        <NavLink to="/test-runner" className={linkClass} onClick={() => setOpen(false)}>
          <ClipboardCheck size={18} />
          Test Runner
        </NavLink>
```

- [ ] **Step 7: Verify in the browser**

Run `npm run dev`, open `http://localhost:5173/test-runner`, paste `https://tiket.testrail.com/index.php?/runs/view/17748`, and confirm: 176 rows render, counts show 59 Passed and 117 Untested, `C…` links open TestRail, sorting by name reorders rows, and reloading the page restores instantly without a TestRail call.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/TestRunner.jsx client/src/components/testRunner client/src/App.jsx client/src/components/Sidebar.jsx
git commit -m "Add Test Runner page with run entry and read-only run table"
```

---

### Task 6: Inline editing with autosave

**Files:**
- Create: `client/src/components/testRunner/StatusCell.jsx`
- Modify: `client/src/components/testRunner/TestRunTable.jsx`
- Modify: `client/src/pages/TestRunner.jsx`

**Interfaces:**
- Consumes: `PATCH /api/test-runs/:runId/tests/:testId` with body `{ statusId?|priorityId?|title?|comment? }`, `null` clearing a field; returns the full view
- Produces: `StatusCell({ test, vocab, disabled, onPatch })`; `onPatch(testId, patch)` on the page, which replaces `state` with the response

- [ ] **Step 1: Add `onPatch` to the page**

```javascript
const [saving, setSaving] = useState(false);
const [savedAt, setSavedAt] = useState(null);

const onPatch = useCallback(
  async (testId, patch) => {
    setSaving(true);
    try {
      const next = await json(`${API}/${runId}/tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setState(next);
      setSavedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  },
  [runId]
);
```

Render a live region next to the toolbar: `<p className="text-xs text-gray-500" aria-live="polite">{saving ? 'Saving…' : savedAt ? 'Saved' : ''}</p>`.

- [ ] **Step 2: Write `client/src/components/testRunner/StatusCell.jsx`**

```jsx
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { QUICK_STATUS_IDS, statusStyle, statusLabel } from './statusVocab';

export default function StatusCell({ test, vocab, disabled, onPatch }) {
  const [open, setOpen] = useState(false);
  const quick = (vocab?.statuses || []).filter((status) => QUICK_STATUS_IDS.includes(status.id));
  const rest = (vocab?.statuses || []).filter((status) => !QUICK_STATUS_IDS.includes(status.id));
  const isDraft = test.dirtyFields.includes('statusId');

  const set = (statusId) => {
    setOpen(false);
    if (statusId !== test.statusId) onPatch(test.testId, { statusId });
  };

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {quick.map((status) => {
        const active = test.statusId === status.id;
        const style = statusStyle(status.id);
        return (
          <button
            key={status.id}
            type="button"
            disabled={disabled}
            onClick={() => set(status.id)}
            title={status.label}
            aria-pressed={active}
            className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? style.pill : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {status.label.charAt(0)}
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          aria-label="More statuses"
          className="rounded-md border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <MoreHorizontal size={14} />
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {rest.map((status) => (
              <button
                key={status.id}
                type="button"
                onClick={() => set(status.id)}
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                {status.label}
              </button>
            ))}
            {isDraft && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPatch(test.testId, { statusId: null });
                }}
                className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
              >
                Clear draft status
              </button>
            )}
          </div>
        )}
      </div>

      {isDraft && (
        <span
          className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-500"
          title={`Unsaved: ${statusLabel(vocab, test.statusId)}`}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Make Test Name, Priority, and Comments editable in `TestRunTable.jsx`**

Cell 2 (name) becomes an inline editor: local `editingId` and `editValue` state in the table. Clicking the title (with `event.stopPropagation()`) enters edit mode, rendering an `<input>` with classes `w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`, `autoFocus`, `onKeyDown` where `Enter` commits via `onPatch(test.testId, { title: editValue })` and `Escape` cancels, and `onBlur` commits. Commit is skipped when the trimmed value is empty or unchanged. When not editing, render the `Highlight` output plus a `Pencil` icon at 12px in `invisible text-gray-400 group-hover:visible` (add `group` to the `<tr>`).

Cell 3 (priority) becomes a `<select>` with `onClick` stopping propagation, classes `rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500`, options from `vocab.priorities`, and `onChange` calling `onPatch(test.testId, { priorityId: Number(event.target.value) })`.

Cell 4 (status) renders `<StatusCell test={test} vocab={vocab} disabled={readOnlyResults} onPatch={onPatch} />`.

Cell 6 (comments) becomes a `<textarea rows={1}>` with classes `w-full resize-none rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:rows-3`, tracking local value keyed by `testId`, committing `onBlur` when changed, and `onFocus` setting `rows` to 3 via state. `Escape` reverts to the server value.

Each edited cell shows a `h-1.5 w-1.5 rounded-full bg-blue-500` dot when its field name appears in `test.dirtyFields`.

- [ ] **Step 4: Verify in the browser**

With `npm run dev` running: click a status button and confirm the row gains a blue left border, the Upload label becomes `Upload 1 change`, and reloading the page keeps it. Rename a test, change a priority, type a comment, then confirm `server/data/testRuns/17748.json` contains the matching `draft` keys:

```bash
node -e "
const s = require('./src/lib/testRunnerStore').readSnapshot(17748);
console.log(Object.values(s.tests).filter((t) => Object.keys(t.draft).length).map((t) => [t.testId, t.draft]));
"
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/testRunner client/src/pages/TestRunner.jsx
git commit -m "Add inline status, name, priority, and comment editing with autosave"
```

---

### Task 7: Search, filters, and sort controls

**Files:**
- Modify: `client/src/pages/TestRunner.jsx`
- Modify: `client/src/components/testRunner/TestRunTable.jsx`

**Interfaces:**
- Consumes: `Highlight` from `TestRunTable.jsx`, `statusStyle` / `priorityLabel` from `statusVocab.js`
- Produces: filtering state on the page; `TestRunTable` already accepts `query`

- [ ] **Step 1: Add a filter bar to the page**

State: `query`, `statusFilter` (`Set` of status ids), `priorityFilter` (`Set` of priority ids), `onlyChanged`, `onlyConflicts`.

```javascript
const visibleTests = useMemo(() => {
  const needle = query.trim().toLowerCase();
  return sortedTests.filter((test) => {
    if (needle && !test.title.toLowerCase().includes(needle)) return false;
    if (statusFilter.size > 0 && !statusFilter.has(test.statusId)) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(test.priorityId)) return false;
    if (onlyChanged && test.dirtyFields.length === 0) return false;
    if (onlyConflicts && test.conflicts.length === 0) return false;
    return true;
  });
}, [sortedTests, query, statusFilter, priorityFilter, onlyChanged, onlyConflicts]);
```

Bar layout: `flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3`.
- Search input with a `Search` icon at 14px positioned inside, classes `w-64 rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500`, placeholder `Search test name…`, and an `X` button to clear when non-empty.
- Status chips, one per `vocab.statuses`: `rounded-full border px-2.5 py-1 text-xs font-medium`, using `statusStyle(id).pill` when selected and `border-gray-200 bg-white text-gray-500 hover:bg-gray-50` otherwise. Clicking toggles membership in `statusFilter`.
- Priority chips, same pattern with `priorityLabel`, selected style `border-blue-200 bg-blue-50 text-blue-800`.
- Two toggles rendered as chips: `Only changed` and `Only conflicts`, showing counts `(${dirtyCount})` and `(${conflictCount})`.
- A right-aligned `text-xs text-gray-500` reading `${visibleTests.length} of ${state.tests.length} tests`.

- [ ] **Step 2: Add an empty-filter state to the table**

When `tests.length === 0`, render a single row spanning six columns with `px-4 py-10 text-center text-sm text-gray-500` reading `No tests match your filters.`

- [ ] **Step 3: Verify in the browser**

Search `banner` and confirm only matching rows remain with the matched substring highlighted amber; toggle Passed to see 59 rows; toggle `Only changed` to see just your edits; confirm the `x of 176` counter tracks.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/TestRunner.jsx client/src/components/testRunner/TestRunTable.jsx
git commit -m "Add name search with highlighting plus status, priority, and change filters"
```

---

### Task 8: Case detail drawer

**Files:**
- Create: `client/src/components/testRunner/CaseDrawer.jsx`
- Modify: `client/src/pages/TestRunner.jsx`
- Modify: `client/package.json`

**Interfaces:**
- Consumes: `GET /api/test-runs/:runId/tests/:testId` returning `{ testId, caseId, runTitle, caseTitle, refs, preconds, steps, expected, lastResultComment }`
- Produces: `CaseDrawer({ runId, test, vocab, detail, loading, disabled, onClose, onPatch })`

- [ ] **Step 0: Install DOMPurify**

```bash
cd client && npm install dompurify
```

- [ ] **Step 1: Write `CaseDrawer.jsx`**

Container: `<aside className="w-[440px] shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white">` inside a page-level `flex gap-4`, so it displaces the table rather than overlapping it. The table wrapper gets `min-w-0 flex-1`.

Header: `sticky top-0 border-b border-gray-200 bg-white px-5 py-4` containing the effective title in `text-sm font-semibold text-gray-900`, a `text-xs text-gray-500` line with `C${caseId}` linked to TestRail and the Jira ref when present, and an `X` close button at `absolute right-3 top-3`.

Body: `space-y-5 px-5 py-4`, with sections rendered only when their content exists. Each section is a `text-xs font-semibold uppercase tracking-wide text-gray-500` label above content.

HTML fields (`preconds`, `steps`, `expected`) are **sanitized before rendering** — a TestRail case body is user-editable content, so it must not be trusted to execute inside this tool:

```jsx
import DOMPurify from 'dompurify';

function CaseHtml({ html }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return (
    <div
      className="max-w-none text-sm text-gray-700 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
```

Below the case text, repeat the execution controls: `<StatusCell test={test} vocab={vocab} disabled={disabled} onPatch={onPatch} />` and a `<textarea rows={4}>` bound to the comment with the same commit-on-blur behavior as the table cell.

When `test.titleDivergedFromRun`, show an amber note: `rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800` reading `The case is renamed in TestRail. This run's view keeps the original title ("${detail.runTitle}") until a new run is created.`

While `loading`, show three `animate-pulse rounded bg-gray-100` blocks.

- [ ] **Step 2: Wire the drawer into the page**

```javascript
const [detail, setDetail] = useState(null);
const [detailLoading, setDetailLoading] = useState(false);

useEffect(() => {
  if (!activeTestId || !runId) {
    setDetail(null);
    return;
  }
  let cancelled = false;
  setDetailLoading(true);
  json(`${API}/${runId}/tests/${activeTestId}`)
    .then((body) => {
      if (!cancelled) setDetail(body);
    })
    .catch(() => {
      if (!cancelled) setDetail(null);
    })
    .finally(() => {
      if (!cancelled) setDetailLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [runId, activeTestId]);
```

`onRowClick` sets both `activeTestId` and `focusedTestId`. Clicking the already-active row closes the drawer.

- [ ] **Step 3: Verify in the browser**

Click a row: the drawer opens on the right, the table shrinks without rows jumping, the clicked row shows the blue tint, steps and expected result render as a list, setting a status from inside the drawer updates the row, and `Escape` closes it.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/testRunner/CaseDrawer.jsx client/src/pages/TestRunner.jsx
git commit -m "Add case detail drawer with in-drawer status and comment editing"
```

---

### Task 9: Keyboard navigation

**Files:**
- Modify: `client/src/pages/TestRunner.jsx`

**Interfaces:**
- Consumes: `SHORTCUT_TO_STATUS` from `statusVocab.js`, `visibleTests`, `onPatch`
- Produces: document-level key handling plus a shortcut legend and `?` overlay

- [ ] **Step 1: Add the key handler**

```javascript
useEffect(() => {
  const isTyping = (target) =>
    target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

  const onKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Escape') {
      if (isTyping(event.target)) return;
      setActiveTestId(null);
      setShowShortcuts(false);
      return;
    }

    if (isTyping(event.target)) return;

    if (event.key === '/') {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      setShowShortcuts((value) => !value);
      return;
    }

    if (visibleTests.length === 0) return;
    const index = visibleTests.findIndex((test) => test.testId === focusedTestId);

    if (event.key === 'j' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = visibleTests[Math.min(index + 1, visibleTests.length - 1)] || visibleTests[0];
      setFocusedTestId(next.testId);
      document.getElementById(`test-row-${next.testId}`)?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (event.key === 'k' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = visibleTests[Math.max(index - 1, 0)] || visibleTests[0];
      setFocusedTestId(prev.testId);
      document.getElementById(`test-row-${prev.testId}`)?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (event.key === 'Enter' && focusedTestId) {
      event.preventDefault();
      setActiveTestId((current) => (current === focusedTestId ? null : focusedTestId));
      return;
    }

    const statusId = SHORTCUT_TO_STATUS[event.key.toLowerCase()];
    if (statusId && focusedTestId && !readOnlyResults) {
      event.preventDefault();
      const focused = visibleTests.find((test) => test.testId === focusedTestId);
      if (focused && focused.statusId !== statusId) onPatch(focusedTestId, { statusId });
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}, [visibleTests, focusedTestId, readOnlyResults, onPatch]);
```

Add `id={`test-row-${test.testId}`}` to each `<tr>` in `TestRunTable.jsx`, and pass `searchRef` to the search input.

- [ ] **Step 2: Add the legend and overlay**

Legend under the filter bar: `text-xs text-gray-500` reading `j / k move · p f b r set status · Enter details · / search · ? shortcuts`, with each key in `<kbd className="rounded border border-gray-300 bg-gray-50 px-1 text-[10px] font-medium text-gray-600">`.

Overlay when `showShortcuts`: fixed backdrop `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4` with a `w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl` panel listing every shortcut as label/`kbd` rows, closing on backdrop click or `Escape`.

- [ ] **Step 3: Verify in the browser**

Press `j` repeatedly to walk rows with a visible focus ring and auto-scroll, `p` to pass the focused row, `Enter` to open the drawer, `/` to jump to search, then confirm typing `p` inside the comment box does not change a status.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/TestRunner.jsx client/src/components/testRunner/TestRunTable.jsx
git commit -m "Add keyboard navigation and status shortcuts to the test runner"
```

---

### Task 10: Upload, conflicts, and run-state banners

**Files:**
- Modify: `client/src/pages/TestRunner.jsx`
- Modify: `client/src/components/testRunner/TestRunTable.jsx`

**Interfaces:**
- Consumes: `POST /api/test-runs/:runId/upload` returning `{ outcome, state }`
- Produces: upload summary banner, conflict banner with per-row resolution, completed-run banner

- [ ] **Step 1: Add the upload action**

```javascript
const [uploading, setUploading] = useState(false);
const [uploadOutcome, setUploadOutcome] = useState(null);

const onUpload = async () => {
  setUploading(true);
  setUploadOutcome(null);
  try {
    const body = await json(`${API}/${runId}/upload`, { method: 'POST' });
    setState(body.state);
    setUploadOutcome(body.outcome);
    setError(null);
  } catch (err) {
    setError(err.message);
  } finally {
    setUploading(false);
  }
};
```

- [ ] **Step 2: Render the upload summary**

Success shape (`resultsFailed === 0 && casesFailed === 0`): `rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800` with a `CheckCircle2` icon and text `Uploaded ${pushed} result(s) and ${casesUpdated} case update(s).`

Otherwise use the amber banner and list, one line each: `${resultsFailed} result(s) failed`, `${casesFailed} case update(s) failed`, `${skippedUntested.length} row(s) skipped because TestRail cannot set a test back to Untested`, followed by the first three `errors` entries in `font-mono text-xs`. Both banners are dismissible with an `X`.

- [ ] **Step 3: Render conflicts**

When `state.conflictCount > 0`, show an amber banner above the table: `${conflictCount} row(s) changed in TestRail while you were editing.` with a button `Show only conflicts` that sets `onlyConflicts`.

In the table, when `test.conflicts.length > 0`, render beneath the affected cell a `mt-1 flex items-center gap-1 text-[11px] text-amber-800` line reading `TestRail: ${statusLabel(vocab, conflict.theirs)}` for `statusId`, `TestRail: ${priorityLabel(vocab, conflict.theirs)}` for `priorityId`, or `TestRail: "${conflict.theirs}"` for `title`, followed by two link-style buttons in `font-medium text-blue-700 hover:underline`:
- `Keep mine` → `onPatch(test.testId, { [conflict.field]: conflict.mine })`
- `Take theirs` → `onPatch(test.testId, { [conflict.field]: null })`

- [ ] **Step 4: Render the read-only run banner**

Compute `const readOnlyResults = Boolean(state?.run.isCompleted || state?.run.isArchived);` and pass it to the table and the drawer. When true, show `rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800`: `This run is ${state.run.isArchived ? 'archived' : 'completed'}, so TestRail rejects new results. Names and priorities can still be updated.`

Also show a per-row red marker when `test.uploadError`: an `AlertCircle` icon at 12px in `text-red-500` with the message as its `title`.

- [ ] **Step 5: Verify against real TestRail**

Set a status and a comment on one row, rename one case, press Upload, then confirm in the TestRail UI that the result and the case rename landed. Confirm the Upload button returns to `Upload` disabled, and that a row left Untested is reported as skipped. Then force a conflict: draft a status locally, change that same test in TestRail directly, press Sync, and confirm the amber conflict row appears with working `Keep mine` / `Take theirs`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TestRunner.jsx client/src/components/testRunner/TestRunTable.jsx
git commit -m "Add upload flow with result summary, conflict resolution, and run-state banners"
```

---

### Task 11: Rename propagation check and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-testrail-test-runner-design.md`
- Modify: `docs/TOOLS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `src/lib/testrail.js`
- Produces: a documented answer to the rename-propagation question and user-facing docs

- [ ] **Step 1: Resolve the rename question empirically**

Pick a test in run 17748, record its case title, rename the case through the tool, and re-read the run:

```bash
node -e "
const tr = require('./src/lib/testrail');
const runId = 17748;
(async () => {
  const tests = await tr.getTests(runId);
  const target = tests[tests.length - 1];
  const original = target.title;
  console.log('case', target.case_id, 'run title:', original);
  await tr.updateCase(target.case_id, { title: original + ' [propagation probe]' });
  const after = await tr.getTests(runId);
  const refreshed = after.find((t) => t.id === target.id);
  console.log('run title after case rename:', refreshed.title);
  console.log('PROPAGATES:', refreshed.title !== original);
  await tr.updateCase(target.case_id, { title: original });
  console.log('reverted');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
"
```

- [ ] **Step 2: Record the answer in the spec**

Replace the "Open question, to be resolved during implementation" paragraph in the spec's "Verified facts" section with the measured result, stating plainly whether a case rename appears in an existing run and therefore whether the per-row divergence note can ever appear.

- [ ] **Step 3: Document the page in `docs/TOOLS.md`**

Add a **Test Runner** section following the existing formatting: what it does, that it needs `TESTRAIL_USER` and `TESTRAIL_API_KEY`, the Sync and Upload semantics, that Untested rows cannot be uploaded, that name and priority edits change the shared case, and the keyboard shortcuts.

- [ ] **Step 4: Mention it in `README.md`**

Add one line to the feature list linking to the `docs/TOOLS.md` section.

- [ ] **Step 5: Full verification**

```bash
npm test
npx eslint .
```

Expected: all tests pass; ESLint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add docs README.md
git commit -m "Document the Test Runner page and record TestRail rename behavior"
```

---

## Manual smoke checklist

Run once at the end, against run 17748:

- [ ] Paste the run URL; 176 rows load with correct counts.
- [ ] Reload the page; the run restores with no TestRail call.
- [ ] Set statuses with `j` / `p` on several rows; each row shows the dirty marker.
- [ ] Add a comment; rename a case; change a priority.
- [ ] Reload again; every draft survives.
- [ ] Press Sync; drafts survive and `Latest TestRail` refreshes.
- [ ] Press Upload; TestRail shows the results and the case changes.
- [ ] Leave one row Untested and confirm it is reported as skipped.
- [ ] Change a test in TestRail directly, Sync, and resolve the conflict both ways.
- [ ] Open a completed run and confirm results upload is blocked with the banner.
