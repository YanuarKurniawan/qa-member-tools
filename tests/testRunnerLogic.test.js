import { describe, it, expect } from 'vitest';
import logicModule from '../src/lib/testRunnerLogic.js';

const { dirtyFields, isDirty, effectiveTitle, mergeSnapshot, computeDelta, toView } = logicModule;

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

  it('ignores a priorityId draft equal to remote', () => {
    expect(dirtyFields(storedTest({ draft: { priorityId: 2 } }))).toEqual([]);
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

describe('effectiveTitle', () => {
  it('prefers draft.title, then caseTitle, then remote.title', () => {
    expect(effectiveTitle(storedTest({ caseTitle: 'case title', draft: { title: 'draft title' } }))).toBe(
      'draft title'
    );
    expect(effectiveTitle(storedTest({ caseTitle: 'case title' }))).toBe('case title');
    expect(effectiveTitle(storedTest())).toBe('success login');
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

  it('never flags a comment draft as a conflict when remote changes', () => {
    const existing = snapshot([storedTest({ draft: { comment: 'note' } })]);
    const incoming = fresh([
      freshTest({ remote: { ...freshTest().remote, statusId: 5, priorityId: 4, title: 'changed title' } }),
    ]);
    const { snapshot: merged, summary } = mergeSnapshot(existing, incoming);
    expect(summary.conflicts).toBe(0);
    expect(merged.tests['1001'].conflicts.some((conflict) => conflict.field === 'comment')).toBe(false);
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

  it('skips Untested status discovered by vocab flag, not hardcoded id 3', () => {
    const vocab = {
      statuses: [
        { id: 1, label: 'Passed', isUntested: false },
        { id: 9, label: 'Untested', isUntested: true },
        { id: 5, label: 'Failed', isUntested: false },
      ],
      priorities: VOCAB.priorities,
    };
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 1 },
      draft: { statusId: 9 },
    });
    const delta = computeDelta({ ...snapshot([stored]), vocab });
    expect(delta.skippedUntested).toEqual([{ testId: 1001, caseId: 2001, title: 'success login' }]);
    expect(delta.results).toEqual([]);
  });

  it('falls back to status id 3 when vocab has no isUntested flag', () => {
    const vocab = {
      statuses: [
        { id: 1, label: 'Passed', isUntested: false },
        { id: 3, label: 'Untested', isUntested: false },
        { id: 5, label: 'Failed', isUntested: false },
      ],
      priorities: VOCAB.priorities,
    };
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 1 },
      draft: { statusId: 3 },
    });
    const delta = computeDelta({ ...snapshot([stored]), vocab });
    expect(delta.skippedUntested).toEqual([{ testId: 1001, caseId: 2001, title: 'success login' }]);
    expect(delta.results).toEqual([]);
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

  it('counts rows with conflicts', () => {
    const view = toView(
      snapshot([
        storedTest({
          conflicts: [{ field: 'statusId', mine: 1, theirs: 5, detectedAt: '2026-08-11T01:00:00.000Z' }],
        }),
        storedTest({ testId: 1002, caseId: 2002, order: 1 }),
      ])
    );
    expect(view.conflictCount).toBe(1);
  });
});
