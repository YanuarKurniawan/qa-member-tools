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

  const addError = (message) => {
    if (!outcome.errors.includes(message)) outcome.errors.push(message);
  };

  if (delta.results.length > 0) {
    if (snapshot.isCompleted || snapshot.isArchived) {
      const message =
        'Run is completed or archived, so TestRail rejects new results. Reopen the run in TestRail to upload them.';
      outcome.resultsFailed = delta.results.length;
      addError(message);
      for (const result of delta.results) {
        snapshot.tests[String(result.testId)].uploadError = message;
      }
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
              if (test.draft) delete test.draft.statusId;
            }
            if ('comment' in result) {
              test.remote.lastResultComment = result.comment;
              if (test.draft) delete test.draft.comment;
            }
            outcome.pushed += 1;
          }
        } catch (err) {
          for (const result of batch) {
            snapshot.tests[String(result.testId)].uploadError = err.message;
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
        const test = snapshot.tests[String(edit.testId)];
        try {
          await testrail.updateCase(edit.caseId, edit.fields);
          if ('title' in edit.fields) {
            test.caseTitle = edit.fields.title;
            if (test.draft) delete test.draft.title;
          }
          if ('priority_id' in edit.fields) {
            test.remote.priorityId = edit.fields.priority_id;
            if (test.draft) delete test.draft.priorityId;
          }
          outcome.casesUpdated += 1;
        } catch (err) {
          test.uploadError = err.message;
          outcome.casesFailed += 1;
          addError(err.message);
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
