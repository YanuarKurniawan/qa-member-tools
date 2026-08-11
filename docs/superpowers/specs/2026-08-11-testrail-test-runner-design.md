# Design Doc: TestRail Test Runner

## Overview

A new page in QA Member Tools that replaces TestRail's own test-run screen for the act of executing a run. You enter a TestRail run ID, the tool pulls its tests into a single editable table, you record results with one keystroke per test, and you push everything back to TestRail when you're done.

TestRail already does this. The complaint is weight: too many clicks and page loads per test. This tool keeps one screen, keeps drafts local until you explicitly upload, and adds keyboard-driven status entry.

## Goals

1. Load a TestRail run's tests into one table: Test ID, Test Name, Priority, Status, Latest TestRail Status, Comments.
2. Record status and comments locally, with nothing sent to TestRail until Upload.
3. Edit case names and priorities inline and push those to TestRail too.
4. Two explicit actions: **Sync** (pull from TestRail) and **Upload** (push to TestRail).
5. Never lose work: drafts survive page reloads, and a Sync does not overwrite unsaved edits.

## Non-goals

- Creating or closing runs, plans, or milestones (use TestRail).
- Managing the case repository — sections, suites, new cases.
- Real-time multi-user collaboration. Two people on one run is tolerated (per-field last-write-wins), not synchronized.
- Attachments, elapsed time, defect/Jira linking, assignee changes, step-level results. All deliberately deferred.

## Verified facts about the target TestRail instance

Confirmed against `https://tiket.testrail.com` (project 184, run 17748) while writing this spec:

**Statuses** (`get_statuses`): Passed (1), Blocked (2), Untested (3), Retest (4), Failed (5), and one custom status Obsolete (6).

**Priorities** (`get_priorities`): Low (1), Medium (2), High (3), Critical (4).

**`get_tests` payload** returns everything the table needs in one paginated call — `id`, `case_id`, `status_id`, `priority_id`, `title`, `refs`, plus `custom_preconds`, `custom_steps`, `custom_expected`. No per-case fetch is required to render the table.

**Payload size**: roughly 9 KB per test because of the steps/expected HTML. Run 17748's 176 tests total about 1.6 MB.

**Run shape**: run 17748 belongs to plan 17742 (suite 12196, project 184, `refs: PLAT-57190`), which confirms runs inside plans must work, not just standalone runs.

**Open question, to be resolved during implementation**: whether TestRail snapshots a test's title at run creation, so that renaming a case does not change the title shown in an existing run. Comparing all 176 test titles against their current case titles found zero mismatches, which is inconclusive (nobody has renamed a case in that suite since the run was created). Implementation must verify this by renaming one throwaway case in a sandbox project and re-reading `get_tests` for a pre-existing run. See "Rename semantics" below for how each outcome is handled.

## Architecture

Three layers, each independently understandable.

### `src/lib/testrail.js` — shared TestRail client (new)

The repo has no shared TestRail client today; Basic-auth header construction is copy-pasted across five services (`testrailAddSection`, `testrailUpdateCase`, `testrailGetSectionId`, `testrailUpdateSection`, `jira/createReport`) and again privately inside `src/lib/automationWeb.js`. This feature introduces the shared client it needs:

```javascript
// src/lib/testrail.js
async function trGet(endpoint)                    // GET /index.php?/api/v2/<endpoint>
async function trPost(endpoint, body)             // POST with JSON body
async function getRun(runId)
async function getTests(runId)                    // paginated, limit=250, returns all
async function getStatuses()
async function getPriorities()
async function updateCase(caseId, fields)
async function addResultsForCases(runId, results)
```

Responsibilities:

- Basic auth from `config.TESTRAIL_USER` / `config.TESTRAIL_API_KEY`, base URL from `config.TESTRAIL_BASE_URL`.
- Throws a named error when credentials are absent, naming both env vars.
- Pagination handled internally at `limit=250`, following the `offset` pattern already used in `testrailGetSectionId`.
- Retry with backoff on transient network errors **and** on HTTP 429, unlike the existing `jsonFetch` in `automationWeb.js` which retries network errors only.
- Errors include TestRail's own `error` field from the response body, not just the HTTP status.

The five existing TestRail services are **not** modified by this work. Migrating them to this client is a follow-up, tracked separately.

### `src/lib/testRunner.js` — feature logic (new)

All merge, dirty-tracking, conflict, and delta logic lives here as pure-ish functions over plain objects, so it is testable without a browser or HTTP.

```javascript
async function loadRun(runId)                          // read snapshot from disk, no TestRail call
async function syncRun(runId, { onLog })               // pull TestRail, merge, persist
async function saveDraft(runId, testId, patch)         // persist one field edit
async function uploadRun(runId, { onLog })             // push delta, persist, re-sync
function mergeSnapshot(existing, fresh)                // pure: returns merged state + conflicts
function computeDelta(state)                           // pure: returns { results, caseEdits, skipped }
function isDirty(test)                                 // pure
```

### `server/routes/testRuns.js` — HTTP layer (new)

Mounted at `/api/test-runs` in `server/index.js`, behind the existing `apiKeyAuth` middleware.

| Method | Path | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/test-runs/:runId` | Read persisted snapshot, no TestRail call | Table state, or 404 if never synced (the page then triggers Sync automatically) |
| `POST` | `/api/test-runs/:runId/sync` | Pull from TestRail, merge, persist | Table state + sync summary |
| `PATCH` | `/api/test-runs/:runId/tests/:testId` | Save one or more draft fields | Updated row + dirty count |
| `POST` | `/api/test-runs/:runId/upload` | Push delta to TestRail, then re-sync | Per-row outcomes + summary |
| `GET` | `/api/test-runs/:runId/tests/:testId` | Lazy-load case detail for the drawer | preconds / steps / expected |
| `GET` | `/api/test-runs` | List recently opened runs from the snapshot directory | `[{ runId, runName, lastSyncedAt, dirtyCount }]` |

Upload responds with plain JSON rather than SSE. Status results are a single API call regardless of row count, and case edits are rare and few; if renames ever grow large enough to risk a request timeout, upgrading to the SSE pattern already used by `POST /api/tools/:toolId/stream` is a contained change.

### `client/src/pages/TestRunner.jsx` + components (new)

Route `/test-runner`, hand-wired in `App.jsx` and `Sidebar.jsx` exactly as `/automation-web` is. State is plain `useState` / `useEffect` / `fetch`, matching the rest of the client (no react-query in this codebase).

Split so no file carries too much:

- `pages/TestRunner.jsx` — run entry, data fetching, keyboard handling, layout.
- `components/testRunner/RunToolbar.jsx` — run name, progress counts, Sync and Upload buttons.
- `components/testRunner/TestRunTable.jsx` — table, sorting, search highlighting.
- `components/testRunner/StatusCell.jsx` — inline status buttons plus overflow.
- `components/testRunner/CaseDrawer.jsx` — side drawer with case detail.

## Data model

One JSON file per run at `server/data/testRuns/<runId>.json`. Added to `.gitignore` as `server/data/testRuns/`, since it holds working state, not source.

```json
{
  "runId": 17748,
  "projectId": 184,
  "suiteId": 12196,
  "planId": 17742,
  "runName": "[General] Berburu Tiket Murah Improvement for Anniversary Campaign",
  "runUrl": "https://tiket.testrail.com/index.php?/runs/view/17748",
  "isCompleted": false,
  "isArchived": false,
  "lastSyncedAt": "2026-08-11T04:20:00.000Z",
  "lastUploadedAt": null,
  "vocab": {
    "statuses": [{ "id": 1, "label": "Passed", "isUntested": false }],
    "priorities": [{ "id": 4, "label": "Critical" }]
  },
  "tests": {
    "25955424": {
      "testId": 25955424,
      "caseId": 2371651,
      "order": 0,
      "remote": {
        "title": "Verify BTM hero banner shows new Anniversary assets",
        "priorityId": 2,
        "statusId": 3,
        "refs": "PLAT-57190",
        "preconds": null,
        "steps": "<ol>...</ol>",
        "expected": "<p>...</p>",
        "lastResultComment": null
      },
      "caseTitle": null,
      "draft": {
        "statusId": 1,
        "comment": "verified on iOS 17",
        "title": "Verify BTM hero banner shows new Anniversary assets on mobile"
      },
      "conflicts": [],
      "uploadError": null
    }
  }
}
```

Rules that keep this honest:

- `remote` is the last-synced TestRail truth. `draft` contains **only** fields you actually edited; an absent key means "unchanged".
- Dirty is derived, never stored: a test is dirty when some `draft` key's value differs from the same key in `remote`. A `comment` is dirty when non-empty, since `remote` has no comment field (comments belong to results, not tests).
- Every editable cell displays `draft.<field> ?? remote.<field>`. This is why clearing a draft after a successful upload does not blank the cell — it falls back to the freshly synced remote value.
- `caseTitle` is the case-level title as this tool last wrote it, held separately from `remote.title` (the run's copy). Title display precedence is `draft.title ?? caseTitle ?? remote.title`, and title dirtiness compares against `caseTitle ?? remote.title`. This is what makes the rename question below a non-blocker: whichever way TestRail behaves, the row shows the title you actually set.
- `conflicts` is an array, since a row can collide on more than one field at once. Each entry is `{ field, mine, theirs, detectedAt }`.
- Because a comment has no remote counterpart, a comment can never be in conflict. On successful upload the comment is removed from `draft` and recorded as `remote.lastResultComment` for reference only; it is not an editable field and never re-enters the delta.
- `order` preserves TestRail's own run ordering for the default sort, recomputed from the fresh payload on every Sync.
- Snapshot writes are atomic: write `<runId>.json.tmp`, then rename. A crash mid-write cannot corrupt existing drafts.
- `vocab` is cached so the table renders without extra round-trips, and is refreshed on every Sync.

## Sync

1. `get_run/<runId>` for metadata: name, project, suite, plan, `is_completed`, `is_archived`.
2. `get_tests/<runId>` paginated at 250 per page.
3. `get_statuses` and `get_priorities` for the vocabulary.
4. `mergeSnapshot(existing, fresh)` per test:
   - Refresh `remote` from the fresh payload.
   - Set `conflict` when a field's **new** remote value differs from the **stored** remote value *and* a `draft` exists for that same field. Record `{ field, mine, theirs, detectedAt }`.
   - Otherwise update `remote` silently — someone else passing a test you never touched is not a conflict.
   - Drafts are never discarded by a Sync.
5. Tests present in TestRail but not in the snapshot are added as new rows. Tests in the snapshot but no longer in the run are removed; if any removed test had a draft, the sync summary reports it explicitly (for example, "2 tests you edited are no longer in this run") rather than deleting quietly.
6. Persist atomically and return the merged state.

Sync never destroys drafts, and there is deliberately no "discard everything" button in this version. Starting a run clean means deleting `server/data/testRuns/<runId>.json`.

## Upload

`computeDelta(state)` splits changes into two groups because they hit different endpoints with different blast radius.

### Group 1 — Results (affect this run only)

A single `add_results_for_cases/<runId>` call carrying every row where `draft.statusId` differs from `remote.statusId` **or** `draft.comment` is non-empty:

```json
{ "results": [{ "case_id": 2371651, "status_id": 1, "comment": "verified on iOS 17" }] }
```

- Rows whose draft status is Untested (3) are **excluded**, because the API cannot set a test back to Untested. Each exclusion produces a log line so the skip is never silent.
- Comment-only rows (comment set, status unchanged) **are** included. TestRail accepts a result with a comment and no `status_id`, which is exactly what "I noted something but didn't finish" means.
- Chunked at 250 results per call as a safety margin.

### Group 2 — Case edits (affect every run using that case)

One `update_case/<caseId>` per case with a changed `title` or `priorityId`, both fields merged into a single call. Throttled with at most 5 concurrent requests, following the throttling habit of the existing TestRail services.

### Ordering and failure handling

Results are pushed first: test evidence matters more than metadata and must not be blocked by a rename failure. The two groups are independent.

For every field that succeeds, the value moves from `draft` into `remote` and leaves the delta (a comment moves to `remote.lastResultComment`, per the data model rules). For every field that fails, the draft is **kept** and `uploadError` is set on that row, so pressing Upload again retries precisely the failures and nothing else.

Upload finishes with an automatic Sync so the screen reflects TestRail's actual state. The response reports `{ results: { pushed, skippedUntested, failed }, caseEdits: { updated, failed }, rows: [...] }`, surfaced as a summary banner plus per-row error markers.

### Rename semantics

Implementation must first verify whether TestRail reflects a case rename in an existing run (see "Verified facts" above). Handling for both outcomes:

- **If renames do propagate**: `remote.title` and `caseTitle` agree after the next Sync and nothing is shown.
- **If TestRail snapshots titles at run creation**: the case is genuinely updated and future runs pick it up, but this run's `get_tests` keeps returning the old title. Because display precedence is `draft.title ?? caseTitle ?? remote.title`, the row still shows your title; the divergence between `caseTitle` and `remote.title` is what triggers a quiet per-row note explaining that TestRail's own run view keeps the original.

Either way the behavior is correct, so the verification determines only whether that note ever appears — it does not block implementation.

## Interface

Visual language follows `DESIGN.md`: gray scale surfaces, `blue-600` accent, `rounded-xl` cards, `text-sm` body, `lucide-react` icons. Status colors map to the existing semantic set — Passed green, Failed red, Blocked amber, Retest blue, Untested and Obsolete gray.

### Shell

Sidebar entry **Test Runner** at `/test-runner`. The run input accepts a bare ID or a pasted TestRail URL (`.../runs/view/17748`), extracting the ID from the URL because pasting is the realistic behavior. Recently opened runs render as chips below the input from `GET /api/test-runs`, so reopening yesterday's run costs one click and no API calls.

The toolbar shows the run name linked to TestRail, a compact progress summary (`59 passed · 117 untested`), **Sync** labelled with freshness (`Synced 3m ago`), and **Upload** labelled with stakes (`Upload 7 changes`, disabled at zero).

### Table

| Column | Behavior |
|---|---|
| Test ID | `C2371651` in mono, links to the case in TestRail |
| Test Name | Click to edit inline; Enter commits, Esc reverts |
| Priority | Dropdown from cached vocab (Low / Medium / High / Critical) |
| Status | Inline Pass / Fail / Block / Retest buttons; Obsolete in an overflow menu |
| Latest testrail status | Read-only pill showing `remote.statusId` from the last Sync |
| Comments | Single-line input that grows into a textarea on focus |

Compact rows with a sticky header. Every changed field shows a blue left-edge bar on the row and a dot on the cell, so unsaved work is visible in place rather than only in a counter. Conflicted rows get an amber marker plus a banner offering per-row "keep mine" or "take theirs". Rows with `uploadError` get a red marker with the TestRail message on hover.

Search matches **names only**, partial and case-insensitive, highlighting the matched substring in amber. Filters are status and priority chips plus two mid-run toggles: **Only changed** and **Only conflicts**. Every column header sorts; the default order is TestRail's run order via `order`.

### Keyboard

`j` / `k` move the focused row, `p` / `f` / `b` / `r` set its status, `Enter` opens the drawer, `Esc` closes it, `/` focuses search. A one-line legend sits under the toolbar and `?` opens a full shortcut overlay. Shortcuts are suppressed while a text input has focus.

### Drawer

A roughly 440px right-hand panel that shifts the table rather than overlapping it, so rows never move underneath the cursor. It shows the case title, its TestRail link, the Jira ref, and rendered preconditions, steps, and expected result (lazy-loaded via `GET /api/test-runs/:runId/tests/:testId`). Status buttons and the comment box are repeated inside the drawer so a test can be executed entirely from it. The active row keeps a left accent bar and tinted background.

Edits autosave on commit — blur or Enter — with a quiet `Saved` indicator and an `aria-live` announcement. Nothing reaches TestRail until Upload.

## Error handling

| Situation | Behavior |
|---|---|
| Missing credentials | Error naming `TESTRAIL_USER` and `TESTRAIL_API_KEY` explicitly |
| Run not found / no permission | Error stating which endpoint failed and the TestRail message |
| HTTP 429 | Retried with backoff inside `testrail.js`, surfaced as "TestRail rate-limited us, retrying" |
| Completed or archived run | Banner shown, results Upload disabled; case edits remain allowed since TestRail permits them regardless |
| Case deleted in TestRail | That row's case edit fails, keeps its draft, and is marked with `uploadError` |
| Two people on one run | Per-field last-write-wins. Field-scoped `PATCH` narrows collisions to the same cell; atomic writes prevent file corruption |
| Partial upload failure | Successful fields clear, failed fields keep drafts and are marked; re-pressing Upload retries only failures |

## Testing

The repo currently has no test runner. This work adds **Vitest**, scoped narrowly to the pure logic in `src/lib/testRunner.js` where a silent bug would corrupt real test results:

- `mergeSnapshot` — draft preservation, conflict detection, added and removed tests.
- `computeDelta` — dirty detection, Untested exclusion, comment-only inclusion, case-edit grouping.
- `isDirty` — including the comment special case.

Fixtures are captured from run 17748 so the tests run against realistic payload shapes. No component tests, no HTTP mocking, no tests for the existing untested codebase.

Alongside that, a manual smoke checklist against a sandbox run: sync, set statuses by keyboard, add comments, rename a case, reload the page to confirm drafts persist, upload, confirm in TestRail, then force a conflict by editing TestRail directly and re-syncing.

## Out of scope, deliberately

Attachments, elapsed time, defect/Jira linking, assignee changes, step-level results, bulk multi-row status apply, a discard-all-drafts action, creating or closing runs, and migrating the five existing TestRail services to the new shared client.
