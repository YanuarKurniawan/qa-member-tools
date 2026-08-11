---
name: update-automation-web
description: Refresh the "Automation WEB" reconciliation dashboard by re-pulling counts from Google Sheet, Jira, and TestRail. Use when the user asks to update/refresh the Automation WEB dashboard, its data, or the "Last Data Update" figure.
---

# Update Automation WEB dashboard

The **Automation WEB** page (`/automation-web` in the app) reconciles WEB (dWeb / Eiffel)
automation coverage across three sources that are supposed to agree:

| Source | Metric | Definition |
|--------|--------|------------|
| Google Sheet | `ShouldRun = y` (dweb) | Rows in `Sheet1` where **Platform** = `dweb` (case-insensitive; `dWeb` counts too) **and** the **ShouldRun** column is `y` |
| Jira | `Done` | Child issues of epic **QAAUT-30177** with **Story Type** = `New Feature` and label **P0**, excluding **Invalid** / **Dropped**, whose status is **Done** |
| TestRail | `Automation Yes + Done` | Cases in the **P0** sub-sections of the **Platform-Eiffel** subtree (suite 4844, project 162) where `custom_automation_type = 2` (Yes) **and** `custom_automation_status = 1` (Done) |

Data lives in `server/data/automationWeb.json` and is served at `GET /api/automation-web`.
The page shows the three counts, whether they match, and a **Last Data Update** timestamp.

Below the source cards is a single tabbed panel —
**Connection | Sheet breakdown | Jira breakdown | TestRail breakdown**:

- **Connection** (default tab): the three sources joined into one row per test, with
  `Jira ID | TestRail ID | Test Name | Synced`. Built by `buildConnections()` and stored at the top
  level of the snapshot as `connections`, not under `sources`. See [How the join works](#how-the-join-works).

- **Google Sheet breakdown — dweb**: every `dweb` row with `Title | Platform | ShouldRun | Jira Link | TestRail Link | Priority`. Jira/TestRail links are clickable; when a cell holds a HYPERLINK whose display text is only the key/case-id, the URL is rebuilt from `JIRA_BASE_URL` / `TESTRAIL_BASE_URL`. This list is in `sources.googleSheet.rows`.
- **Jira breakdown**: every in-scope child of the epic with `Jira ID | Title | Labels | Status | Assignee | QA Assignee`, sorted Done → in progress → not started. This list is in `sources.jira.rows`. Jira custom fields used: `customfield_10904` (Story Type) and `customfield_10796` (QA Assignee).
- **TestRail breakdown — Platform-Eiffel · P0**: **every** in-scope case (not just the counted ones — `No` / `Not yet` cases are listed too) with `Case ID | Title | Folder | Label | Automation Type | Automation Status | Reference`. **Reference** is TestRail's `refs` field, which holds Jira keys — they are parsed into `{ key, url }` and deep-linked to `JIRA_BASE_URL`. Sections nest as `Platform-Eiffel / <folder> / <label>` (e.g. `Membership / P0`), so **Folder** is Membership / UNM / LOYALTY and **Label** is the P0 / P1 sub-section. Rows follow TestRail's own section order, automated cases first inside each folder+label group. This list is in `sources.testrail.cases`; the header chips come from `sources.testrail.breakdown.type` and `.status`.

The sheet platform filter is overridable via `AUTOMATION_WEB_SHEET_PLATFORM` (default `dweb`). The Jira
filters are `AUTOMATION_WEB_JIRA_STORY_TYPE` (default `New Feature`), `AUTOMATION_WEB_JIRA_LABEL`
(default `P0`), and `AUTOMATION_WEB_JIRA_EXCLUDE_STATUSES` (default `Invalid,Dropped` — abandoned work
that would otherwise inflate the denominator). TestRail is scoped by `AUTOMATION_WEB_TR_SECTION`
(default `Platform-Eiffel`) and `AUTOMATION_WEB_TR_LABEL` (default `P0`). Set any of them to an empty
string to drop that filter.

The shared fetch logic lives in `src/lib/automationWeb.js` and is used by both the CLI script
and the server endpoint `POST /api/automation-web/refresh`.

## How the join works

The **Google Sheet is the spine**. It is the only source carrying *both* foreign keys on every row
(Jira key + TestRail case id). TestRail's `refs` field is only partly filled in, Jira carries no
outbound key at all, and titles are useless as a join key because the three systems name the same
test differently (`editMainProfileWeb` / `[WEB][UNM] Login - …` / `User edit the main profile`).

`buildConnections()` walks the sheet's `ShouldRun = y` rows, attaches the TestRail case by id and the
Jira issue by key, then appends any in-scope TestRail case or Jira issue that no sheet row claimed.
The result is the **union** of the three in-scope sets, so a source that is missing an item still
produces a row. Each row carries a three-state verdict per source:

| State | Meaning |
|-------|---------|
| `ok` (green) | Present and inside that source's filter |
| `warn` (amber) | Present but needs attention — outside the filter, duplicated, or the sources disagree about the link |
| `missing` (red) | Nothing to join to |

Every non-`ok` cell carries a plain-English `notes` entry rendered under the pills, so the table says
exactly which system to fix. Amber cases include: a Jira key that exists but sits under a different
epic (resolved with a per-key `GET /issue/{key}` lookup so the reason can be named), one Jira key
claimed by several sheet rows, a TestRail case with no `refs`, and a TestRail `refs` value that
disagrees with the sheet's Jira key for the same case.

Note that matching **counts** does not mean matching **sets** — the three sources can each report 24
while disagreeing about which 24. That is what this tab exists to catch.

## Two ways to refresh

1. **In the UI** — on the `/automation-web` page:
   - **Refresh all** (top-right) re-pulls every source.
   - Each source card has its own small refresh button that re-pulls **only that platform**,
     carrying the other two over unchanged. Each card shows its own "updated X ago" time.

   Refreshing pulls **Google Sheet + TestRail live**. Jira is refreshed live **only if
   `JIRA_API_TOKEN` is set in `.env`**; otherwise the previous Jira value is kept (shown as "stale")
   and the Jira breakdown rows are carried over unchanged — supplied counts can't rebuild them.
2. **CLI / this command** — best when there is no Jira token, because the agent can supply the
   Jira counts from the Atlassian MCP (steps below).

Both the endpoint (`POST /api/automation-web/refresh`) and the CLI accept an optional
single-source selector: `{ only: 'jira' }` in the request body, or `--only=jira` on the CLI
(valid keys: `googleSheet`, `testrail`, `jira`).

## Refresh via CLI

The refresh engine is `scripts/refreshAutomationWeb.js` (thin wrapper over `src/lib/automationWeb.js`).
It reads credentials from `.env`:

- **Google Sheets** — service account (`GOOGLE_SERVICE_ACCOUNT_FILE` → the `oauth2.json` at
  `~/IdeaProjects/TIKET-AUTOMATION/src/main/resources/oauth2.json`, or inline `GOOGLE_SERVICE_ACCOUNT_KEY`).
- **TestRail** — `TESTRAIL_USER` + `TESTRAIL_API_KEY` (native `get_cases` returns custom fields in bulk).
- **Jira** — optional `JIRA_EMAIL` + `JIRA_API_TOKEN`.

### Step 1 — Get the Jira counts (only if there is no `JIRA_API_TOKEN` in `.env`)

If `.env` has a `JIRA_API_TOKEN`, skip this — the script fetches Jira itself. Otherwise get the
two counts via the Atlassian MCP (`searchJiraIssuesUsingJql`, `searchResultMode: "count"`):

- cloudId: `4b56b3a8-6af3-464f-9273-7c947772bd43`
- Scope: `parent = QAAUT-30177 AND "Story Type" = "New Feature" AND labels = "P0" AND status NOT IN ("Invalid", "Dropped")`
- Done: the scope above `AND status = Done`
- Total: the scope above

### Step 2 — Run the refresh

```bash
# With a Jira token in .env:
node scripts/refreshAutomationWeb.js

# Without a Jira token — pass the counts from Step 1:
node scripts/refreshAutomationWeb.js --jira-done=<DONE> --jira-total=<TOTAL>

# Refresh a single source (others carried over):
node scripts/refreshAutomationWeb.js --only=jira
```

The script fetches Google Sheet + TestRail live, merges Jira, writes `server/data/automationWeb.json`
with a fresh `lastUpdated`, and prints a reconciliation summary
(e.g. `sheet=24, jira=24, testrail=24 → ALL MATCH`).

Note that the Jira **breakdown rows** can only be rebuilt from a live API pull; `--jira-done` /
`--jira-total` update the counts but carry the previous row list over unchanged.

### Step 3 — Report back

Tell the user the three counts, whether they matched, and the new spread. No app restart is
needed — the page reads the JSON on next load. If `npm run dev` is running, just reload
`/automation-web`.

## Notes

- Do **not** commit `.env` (it is gitignored and holds real credentials).
- All source definitions (spreadsheet id, epic key, story type, label, excluded statuses, suite/section, field values)
  live in the `DEFS` constant at the top of `src/lib/automationWeb.js` and are overridable via env vars
  (`AUTOMATION_WEB_SHEET_ID`, `AUTOMATION_WEB_JIRA_EPIC`, `AUTOMATION_WEB_JIRA_STORY_TYPE`,
  `AUTOMATION_WEB_JIRA_LABEL`, `AUTOMATION_WEB_JIRA_EXCLUDE_STATUSES`, `AUTOMATION_WEB_TR_SECTION`,
  `AUTOMATION_WEB_TR_LABEL`, etc.). If a source's definition changes, update those.
- The script is resilient: if one source fails it keeps the previous value for that source,
  marks it `stale`, and exits non-zero so the failure is visible.
