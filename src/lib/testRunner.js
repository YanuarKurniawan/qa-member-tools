const testrail = require('./testrail');
const logic = require('./testRunnerLogic');
const store = require('./testRunnerStore');
const sleep = require('./sleep');

const CASE_EDIT_CONCURRENCY = 5;
const CASE_EDIT_PAUSE_MS = 250;
const RESULT_CHUNK = 250;
const MAX_TITLE = 250;
const MAX_COMMENT = 5000;
const MAX_DEFECTS = 250;

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

function normalizeTest(test, index, folders) {
  const folder = folders.get(test.case_id) || null;
  return {
    testId: test.id,
    caseId: test.case_id,
    order: index,
    remote: {
      title: test.title,
      folder: folder && folder.name,
      folderPath: folder && folder.path,
      statusId: test.status_id,
      priorityId: test.priority_id,
      refs: test.refs || null,
      preconds: test.custom_preconds || null,
      steps: test.custom_steps || null,
      expected: test.custom_expected || null,
      lastResultComment: null,
      lastResultDefects: null,
    },
  };
}

function loadRun(runId) {
  const snapshot = store.readSnapshot(runId);
  return snapshot ? logic.toView(snapshot) : null;
}

// Folders cost two extra endpoints, and they are a convenience column rather than
// something a run cannot be executed without. A failure here leaves the folder unknown
// instead of failing the whole sync; mergeSnapshot then keeps the last known value.
async function fetchFolders(projectId, suiteId) {
  try {
    const [sections, cases] = await Promise.all([
      testrail.getSections(projectId, suiteId),
      testrail.getCases(projectId, suiteId),
    ]);
    return logic.buildFolderIndex(sections, cases);
  } catch (err) {
    console.warn(`[testRunner] folder lookup failed for project ${projectId}: ${err.message}`);
    return new Map();
  }
}

async function syncRun(runId) {
  const run = await testrail.getRun(runId);
  const [rawTests, statuses, priorities, folders] = await Promise.all([
    testrail.getTests(runId),
    testrail.getStatuses(),
    testrail.getPriorities(),
    fetchFolders(run.project_id, run.suite_id),
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
    tests: rawTests.map((test, index) => normalizeTest(test, index, folders)),
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
    } else if (field === 'defects') {
      if (typeof value !== 'string') throw new Error('Defects must be text');
      if (value.length > MAX_DEFECTS) throw new Error(`Defects exceed ${MAX_DEFECTS} characters`);
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

// Applies an upload journal to whatever the snapshot looks like now. A draft key is
// only dropped when it still holds the value we actually pushed, so an edit the
// engineer made while the upload was in flight survives instead of being discarded.
function applyUploadJournal(snapshot, journal, observedDrafts) {
  for (const [key, entry] of journal) {
    const test = snapshot.tests[key];
    if (!test) continue;

    Object.assign(test.remote, entry.remote);
    if (entry.caseTitle !== undefined) test.caseTitle = entry.caseTitle;
    test.uploadError = entry.uploadError;

    const draft = test.draft || {};
    const observed = observedDrafts.get(key) || {};
    for (const field of entry.cleared) {
      if (field in draft && draft[field] === observed[field]) delete draft[field];
    }
  }
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

  // TestRail calls below take seconds, during which autosaves keep writing drafts to
  // disk. Record what the upload achieved instead of mutating this now-aging copy, and
  // replay it onto a fresh read at the end.
  const journal = new Map();
  const observedDrafts = new Map();

  const record = (testId) => {
    const key = String(testId);
    if (!journal.has(key)) {
      journal.set(key, { remote: {}, caseTitle: undefined, cleared: [], uploadError: null });
    }
    return journal.get(key);
  };

  for (const item of [...delta.results, ...delta.caseEdits]) {
    const key = String(item.testId);
    record(item.testId);
    if (!observedDrafts.has(key)) {
      observedDrafts.set(key, { ...(snapshot.tests[key].draft || {}) });
    }
  }

  const addError = (message) => {
    if (!outcome.errors.includes(message)) outcome.errors.push(message);
  };

  // A defect with nothing to attach it to never reaches TestRail, so it is counted as a
  // failed result rather than reported as uploaded, and the row keeps its draft.
  for (const item of delta.blockedDefects) {
    const message = 'Set a status or comment on this row before uploading its defect.';
    record(item.testId).uploadError = message;
    outcome.resultsFailed += 1;
    addError(message);
  }

  if (delta.results.length > 0) {
    if (snapshot.isCompleted || snapshot.isArchived) {
      const message =
        'Run is completed or archived, so TestRail rejects new results. Reopen the run in TestRail to upload them.';
      outcome.resultsFailed = delta.results.length;
      addError(message);
      for (const result of delta.results) {
        record(result.testId).uploadError = message;
      }
    } else {
      const resultDefaults = logic.requiredResultDefaults(
        await testrail.getResultFields(),
        snapshot.projectId
      );

      for (const batch of chunk(delta.results, RESULT_CHUNK)) {
        const payload = batch.map((result) => {
          const entry = { case_id: result.caseId, ...resultDefaults };
          if ('statusId' in result) entry.status_id = result.statusId;
          if ('comment' in result) entry.comment = result.comment;
          if ('defects' in result) entry.defects = result.defects;
          return entry;
        });
        try {
          await testrail.addResultsForCases(runId, payload);
          for (const result of batch) {
            const entry = record(result.testId);
            if ('statusId' in result) {
              entry.remote.statusId = result.statusId;
              entry.cleared.push('statusId');
            }
            if ('comment' in result) {
              entry.remote.lastResultComment = result.comment;
              entry.cleared.push('comment');
            }
            if ('defects' in result) {
              entry.remote.lastResultDefects = result.defects;
              entry.cleared.push('defects');
            }
            outcome.pushed += 1;
          }
        } catch (err) {
          for (const result of batch) {
            record(result.testId).uploadError = err.message;
            outcome.resultsFailed += 1;
          }
          addError(err.message);
        }
      }
    }
  }

  const caseGroups = chunk(delta.caseEdits, CASE_EDIT_CONCURRENCY);
  for (let i = 0; i < caseGroups.length; i++) {
    await Promise.all(
      caseGroups[i].map(async (edit) => {
        const entry = record(edit.testId);
        try {
          await testrail.updateCase(edit.caseId, edit.fields);
          if ('title' in edit.fields) {
            entry.caseTitle = edit.fields.title;
            entry.cleared.push('title');
          }
          if ('priority_id' in edit.fields) {
            entry.remote.priorityId = edit.fields.priority_id;
            entry.cleared.push('priorityId');
          }
          outcome.casesUpdated += 1;
        } catch (err) {
          entry.uploadError = err.message;
          outcome.casesFailed += 1;
          addError(err.message);
        }
      })
    );
    if (i < caseGroups.length - 1) await sleep(CASE_EDIT_PAUSE_MS);
  }

  // Re-read so drafts saved during the upload are not clobbered. Read, apply, and write
  // happen with no await between them, so nothing can interleave in this single process.
  const current = store.readSnapshot(runId) || snapshot;
  applyUploadJournal(current, journal, observedDrafts);
  current.lastUploadedAt = new Date().toISOString();
  store.writeSnapshot(runId, current);
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
