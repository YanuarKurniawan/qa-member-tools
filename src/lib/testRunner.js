const testrail = require('./testrail');
const logic = require('./testRunnerLogic');
const store = require('./testRunnerStore');
const sleep = require('./sleep');

const CASE_EDIT_CONCURRENCY = 5;
const FOLDER_CONCURRENCY = 5;
const FOLDER_SAMPLE_SIZE = 5;
const FOLDER_MAX_ROUNDS = 20;
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

// Folders already established by an earlier sync, keyed by case. A case does not move
// between folders during a run, so resolving one again would only cost requests.
function knownFolders(existing) {
  const known = new Map();
  for (const test of Object.values((existing && existing.tests) || {})) {
    if (test.remote && test.remote.folder) {
      known.set(test.caseId, { name: test.remote.folder, path: test.remote.folderPath });
    }
  }
  return known;
}

// Fetches sections and every ancestor above them, since a parent id is only known once
// its child has been read. Sections that fail to load are cached as null so the walk
// stops there instead of retrying.
async function loadSections(sectionIds, sectionsById) {
  const queued = new Set(sectionIds.filter((id) => id != null && !sectionsById.has(id)));
  const pending = [...queued];

  while (pending.length > 0) {
    const batch = pending.splice(0, FOLDER_CONCURRENCY);
    const fetched = await Promise.all(
      batch.map((id) => testrail.getSection(id).catch(() => null))
    );
    batch.forEach((id, index) => sectionsById.set(id, fetched[index]));

    for (const section of fetched) {
      const parent = section && section.parent_id;
      if (parent != null && !sectionsById.has(parent) && !queued.has(parent)) {
        queued.add(parent);
        pending.push(parent);
      }
    }
  }
}

// Tests arrive grouped by folder, so consecutive cases are usually neighbours in the same
// section and would teach us the same thing. Spreading the picks across what is left
// discovers several of the run's folders per round.
function spreadSamples(unresolved, count) {
  const items = [...unresolved];
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)]);
}

// get_tests does not report a case's section, and reading the suite's whole case list
// costs one request per 250 cases of a suite that can hold thousands. Instead: look up a
// few unresolved cases to learn which sections this run draws from, then pull those
// sections whole. Cost tracks the handful of folders a run spans, not the suite.
async function resolveFolders(rawTests, projectId, suiteId, existing) {
  const folders = knownFolders(existing);
  const unresolved = new Set(
    rawTests.map((test) => test.case_id).filter((caseId) => !folders.has(caseId))
  );
  if (unresolved.size === 0) return folders;

  const sectionByCase = new Map();
  const fetchedSections = new Set();

  for (let round = 0; unresolved.size > 0 && round < FOLDER_MAX_ROUNDS; round++) {
    const samples = spreadSamples(unresolved, FOLDER_SAMPLE_SIZE);
    const sampled = await Promise.all(
      samples.map((caseId) => testrail.getCase(caseId).catch(() => null))
    );

    const sections = [];
    sampled.forEach((item, index) => {
      // A case that cannot be read at all is dropped from the queue so the loop advances.
      if (!item || item.section_id == null) return unresolved.delete(samples[index]);
      if (!fetchedSections.has(item.section_id)) sections.push(item.section_id);
      fetchedSections.add(item.section_id);
    });

    const pages = await Promise.all(
      sections.map((sectionId) =>
        testrail.getCasesInSection(projectId, suiteId, sectionId).catch(() => [])
      )
    );
    for (const page of pages) {
      for (const item of page) {
        if (!unresolved.has(item.id)) continue;
        sectionByCase.set(item.id, item.section_id);
        unresolved.delete(item.id);
      }
    }

    // Whatever the section listing did not account for still has to leave the queue, or
    // the same sample would be drawn forever.
    for (const caseId of samples) unresolved.delete(caseId);
  }

  const sectionsById = new Map();
  await loadSections([...new Set(sectionByCase.values())], sectionsById);
  for (const [caseId, sectionId] of sectionByCase) {
    const folder = logic.folderFromSections(sectionId, sectionsById);
    if (folder) folders.set(caseId, folder);
  }
  return folders;
}

// Folders are a convenience column, not something a run cannot be executed without, so a
// failure here leaves them unknown instead of failing the sync. mergeSnapshot then keeps
// whatever the last sync established.
async function fetchFolders(rawTests, projectId, suiteId, existing) {
  try {
    return await resolveFolders(rawTests, projectId, suiteId, existing);
  } catch (err) {
    console.warn(`[testRunner] folder lookup failed for project ${projectId}: ${err.message}`);
    return knownFolders(existing);
  }
}

async function syncRun(runId) {
  const run = await testrail.getRun(runId);
  const [rawTests, statuses, priorities] = await Promise.all([
    testrail.getTests(runId),
    testrail.getStatuses(),
    testrail.getPriorities(),
  ]);
  // Read purely to reuse folders already resolved. The merge below re-reads the snapshot
  // so drafts saved while these requests were in flight are not lost.
  const folders = await fetchFolders(
    rawTests,
    run.project_id,
    run.suite_id,
    store.readSnapshot(runId)
  );

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
  deleteRun: (runId) => store.deleteSnapshot(runId),
  listRecentRuns: () => store.listSnapshots(),
};
