# Defect field on Test Runner results

Date: 2026-08-12
Status: approved

Extends the Test Runner page (`docs/superpowers/specs/2026-08-11-testrail-test-runner-design.md`)
so a failing case can carry the defect it was filed against.

## Problem

Failing a case records a status and maybe a comment, but not the bug it produced. Engineers
currently leave the tool for TestRail to attach a defect, which is the exact context switch this
page exists to avoid.

## Data model

`defects` joins `comment` as a draft field on a test, with `remote.lastResultDefects` recording
what the last upload pushed:

```
tests[testId] = {
  remote: { statusId, title, priorityId, refs, ..., lastResultComment, lastResultDefects },
  draft:  { statusId?, priorityId?, title?, comment?, defects? },
  ...
}
```

It is a **result** field. It belongs to this run only and never mutates the shared case, unlike
Test Name and Priority. It is distinct from `remote.refs`, the case's own Jira reference already
shown in the panel header, which stays read-only.

Drafts persist in the existing per-run file `server/data/testRuns/<runId>.json`, so a defect
survives reload and is visible from any browser like every other draft.

## Editing

A single-line "Defects" input sits in the case drawer under the comment box, placeholder
`PLAT-1234, PLAT-5678`, autosaving on blur through the existing `PATCH
/api/test-runs/:runId/tests/:testId` endpoint.

The field is offered on every status rather than only on Failed: a Blocked case commonly has a
defect too, and gating the field on status would make it appear and disappear under the cursor.

Completed and archived runs reject results, so the field is disabled there exactly as the comment
box already is.

## Table

Rows holding a defect show a small badge beside the status: the first key, plus a `+N` suffix when
there is more than one, with the full list in the `title` tooltip. No new column, so the existing
layout keeps its widths.

## Links

A value is split on commas. Each part matching `^[A-Za-z]+-\d+$` renders as a link to
`https://borobudur.atlassian.net/browse/<KEY>`, reusing the helper the case refs already use, which
moves out of `CaseDrawer.jsx` into a shared module so the table badge can use it too. Parts that do
not match render as plain text and are still sent to TestRail unchanged.

## Upload

Defects ride on the same result as status and comment, so the delta gains no new request:

```
add_results_for_cases: { case_id, status_id?, comment?, defects?, ...requiredDefaults }
```

TestRail rejects a result carrying nothing but defects: `add_results_for_cases` answers
`HTTP 400 ... one of Status ID, Assigned To or Comment is required` (measured against
`tiket.testrail.com` on 2026-08-12). A comment-only result stays valid, so only the defect needs
handling. When a defect would travel alone the delta restates the status the row already shows,
which is what linking a defect in TestRail's own UI produces.

An Untested row has no status it can restate, so its defect is reported rather than pushed: the row
keeps its draft, gains an `uploadError` of "Set a status or comment on this row before uploading its
defect.", and counts toward `resultsFailed` so the upload summary cannot come back green.

On success the draft key clears and `remote.lastResultDefects` holds the pushed value, following the
same journal-and-replay path that protects concurrent drafts.

## Sync

The tool never reads existing results back from TestRail, so as with comments a Sync leaves drafted
defects untouched. There is no remote value to disagree with, therefore no conflict state.

## Validation

Trimmed; rejected if not text; capped at 250 characters. A key TestRail's Jira plugin refuses
surfaces as that row's `uploadError`, like any other rejection.

## Non-goals

- Reading defects already recorded in TestRail (the tool reads no existing results).
- Creating Jira issues from the tool.
- A popup prompt on failure; the field is always available instead.

## Testing

- Unit: `defects` through `dirtyFields`, `computeDelta` (restated status, blocked Untested row,
  case edits still applying on a blocked row), and `toView`; upload tests covering the push, the
  draft clearing, a rejection, and the blocked row.
- Manual: draft, reload, sync, upload against run 17748, clearing drafts afterwards.
