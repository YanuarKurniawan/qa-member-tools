import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// These are CommonJS modules and the code under test resolves its TestRail client through
// require(). Loading them the same way gives us the exact module objects it uses, so
// swapping a method here is visible inside uploadRun; an ESM default import would not be.
const require = createRequire(import.meta.url);
const testrail = require('../src/lib/testrail.js');
const store = require('../src/lib/testRunnerStore.js');
const runner = require('../src/lib/testRunner.js');

// A run id no real run will collide with, so these tests never touch working snapshots.
const RUN_ID = 999001;

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

function test(id, overrides = {}) {
  return {
    testId: id,
    caseId: id + 1000,
    order: id,
    remote: {
      title: `case ${id}`,
      statusId: 3,
      priorityId: 2,
      refs: null,
      preconds: null,
      steps: null,
      expected: null,
      lastResultComment: null,
    },
    caseTitle: null,
    draft: {},
    conflicts: [],
    uploadError: null,
    ...overrides,
  };
}

function writeSnapshot(tests) {
  const map = {};
  for (const item of tests) map[String(item.testId)] = item;
  store.writeSnapshot(RUN_ID, {
    runId: RUN_ID,
    projectId: 184,
    suiteId: 1,
    planId: null,
    runName: 'Upload concurrency fixture',
    runUrl: 'https://example.invalid/run',
    isCompleted: false,
    isArchived: false,
    lastSyncedAt: '2026-08-11T00:00:00.000Z',
    lastUploadedAt: null,
    vocab: VOCAB,
    tests: map,
  });
}

const original = {};

beforeEach(() => {
  for (const key of ['getResultFields', 'addResultsForCases', 'updateCase']) {
    original[key] = testrail[key];
  }
  testrail.getResultFields = async () => [];
  testrail.addResultsForCases = async () => [];
  testrail.updateCase = async () => ({});
});

afterEach(() => {
  Object.assign(testrail, original);
  const file = store.snapshotPath(RUN_ID);
  if (fs.existsSync(file)) fs.unlinkSync(file);
});

describe('uploadRun draft safety', () => {
  it('pushes drafted statuses and comments and clears them once accepted', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1, comment: 'works' } })]);

    const outcome = await runner.uploadRun(RUN_ID);

    expect(outcome.pushed).toBe(1);
    expect(outcome.resultsFailed).toBe(0);
    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.draft).toEqual({});
    expect(stored.remote.statusId).toBe(1);
    expect(stored.remote.lastResultComment).toBe('works');
  });

  it('keeps a draft saved on another row while the upload was in flight', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1 } }), test(2)]);

    // Simulate the engineer marking row 2 while row 1's results are still uploading.
    testrail.addResultsForCases = async () => {
      runner.saveDraft(RUN_ID, 2, { statusId: 5 });
      return [];
    };

    await runner.uploadRun(RUN_ID);

    const stored = store.readSnapshot(RUN_ID).tests;
    expect(stored['1'].draft).toEqual({});
    expect(stored['2'].draft).toEqual({ statusId: 5 });
  });

  it('keeps a newer edit to the very row being uploaded', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1 } })]);

    // Row 1 uploads as Passed, but the engineer changes it to Failed mid-flight.
    testrail.addResultsForCases = async () => {
      runner.saveDraft(RUN_ID, 1, { statusId: 5 });
      return [];
    };

    await runner.uploadRun(RUN_ID);

    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.remote.statusId).toBe(1);
    expect(stored.draft).toEqual({ statusId: 5 });
  });

  it('clears a comment draft even though the pushed value was trimmed', async () => {
    writeSnapshot([test(1, { draft: { comment: '  spaced  ' } })]);

    await runner.uploadRun(RUN_ID);

    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.remote.lastResultComment).toBe('spaced');
    expect(stored.draft).toEqual({});
  });

  it('records a row-level error and keeps the draft when TestRail rejects the batch', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1 } })]);
    testrail.addResultsForCases = async () => {
      throw new Error('TestRail said no');
    };

    const outcome = await runner.uploadRun(RUN_ID);

    expect(outcome.resultsFailed).toBe(1);
    expect(outcome.errors).toEqual(['TestRail said no']);
    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.draft).toEqual({ statusId: 1 });
    expect(stored.uploadError).toBe('TestRail said no');
  });

  it('applies case renames and priority changes to the stored snapshot', async () => {
    writeSnapshot([test(1, { draft: { title: 'renamed', priorityId: 4 } })]);

    const outcome = await runner.uploadRun(RUN_ID);

    expect(outcome.casesUpdated).toBe(1);
    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.caseTitle).toBe('renamed');
    expect(stored.remote.priorityId).toBe(4);
    expect(stored.draft).toEqual({});
  });

  it('refuses results on a completed run but still flags the rows', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1 } })]);
    const snapshot = store.readSnapshot(RUN_ID);
    snapshot.isCompleted = true;
    store.writeSnapshot(RUN_ID, snapshot);

    const outcome = await runner.uploadRun(RUN_ID);

    expect(outcome.pushed).toBe(0);
    expect(outcome.resultsFailed).toBe(1);
    const stored = store.readSnapshot(RUN_ID).tests['1'];
    expect(stored.draft).toEqual({ statusId: 1 });
    expect(stored.uploadError).toMatch(/completed or archived/);
  });

  it('drops journal entries for tests that vanished from the run mid-upload', async () => {
    writeSnapshot([test(1, { draft: { statusId: 1 } }), test(2)]);

    testrail.addResultsForCases = async () => {
      const snapshot = store.readSnapshot(RUN_ID);
      delete snapshot.tests['1'];
      store.writeSnapshot(RUN_ID, snapshot);
      return [];
    };

    const outcome = await runner.uploadRun(RUN_ID);

    expect(outcome.pushed).toBe(1);
    const stored = store.readSnapshot(RUN_ID).tests;
    expect(stored['1']).toBeUndefined();
    expect(stored['2']).toBeDefined();
  });
});
