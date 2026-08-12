import { describe, it, expect } from 'vitest';
import logicModule from '../src/lib/testRunnerLogic.js';

const {
  dirtyFields,
  isDirty,
  effectiveTitle,
  folderFromSections,
  mergeSnapshot,
  computeDelta,
  requiredResultDefaults,
  toView,
} = logicModule;

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

  it('treats any non-empty defect as dirty', () => {
    expect(dirtyFields(storedTest({ draft: { defects: 'PLAT-1234' } }))).toEqual(['defects']);
  });

  it('ignores a whitespace-only defect', () => {
    expect(dirtyFields(storedTest({ draft: { defects: '  ' } }))).toEqual([]);
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

describe('folderFromSections', () => {
  const sections = (...items) => new Map(items.map((item) => [item.id, item]));

  const NESTED = sections(
    { id: 10, name: 'Campaign', parent_id: null },
    { id: 11, name: 'Android', parent_id: 10 },
    { id: 12, name: 'Login', parent_id: 11 }
  );

  it('names a folder by its leaf and keeps the trail as the path', () => {
    expect(folderFromSections(12, NESTED)).toEqual({
      name: 'Login',
      path: 'Campaign / Android / Login',
    });
  });

  it('uses the section itself for a case sitting at the top of the suite', () => {
    expect(folderFromSections(10, NESTED)).toEqual({ name: 'Campaign', path: 'Campaign' });
  });

  it('returns nothing for a section that was never loaded', () => {
    expect(folderFromSections(999, NESTED)).toBeNull();
  });

  it('stops at a parent that could not be read', () => {
    const partial = sections({ id: 11, name: 'Android', parent_id: 10 });
    partial.set(10, null);
    expect(folderFromSections(11, partial)).toEqual({ name: 'Android', path: 'Android' });
  });

  it('does not hang on a section chain that loops back on itself', () => {
    const cyclic = sections(
      { id: 20, name: 'A', parent_id: 21 },
      { id: 21, name: 'B', parent_id: 20 }
    );
    expect(folderFromSections(20, cyclic)).toEqual({ name: 'A', path: 'B / A' });
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

  it('keeps the known folder when a sync could not resolve one', () => {
    const existing = snapshot([
      storedTest({ remote: { ...storedTest().remote, folder: 'Android', folderPath: 'Campaign / Android' } }),
    ]);
    const { snapshot: merged } = mergeSnapshot(existing, fresh());
    expect(merged.tests['1001'].remote.folder).toBe('Android');
    expect(merged.tests['1001'].remote.folderPath).toBe('Campaign / Android');
  });

  it('takes the new folder when a case has been moved', () => {
    const existing = snapshot([
      storedTest({ remote: { ...storedTest().remote, folder: 'Android', folderPath: 'Campaign / Android' } }),
    ]);
    const incoming = fresh([
      freshTest({ remote: { ...freshTest().remote, folder: 'iOS', folderPath: 'Campaign / iOS' } }),
    ]);
    const { snapshot: merged } = mergeSnapshot(existing, incoming);
    expect(merged.tests['1001'].remote.folderPath).toBe('Campaign / iOS');
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
    expect(computeDelta(snapshot())).toEqual({
      results: [],
      caseEdits: [],
      skippedUntested: [],
      blockedDefects: [],
    });
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

  it('pushes a defect alongside the status that produced it', () => {
    const delta = computeDelta(
      snapshot([storedTest({ draft: { statusId: 5, defects: 'PLAT-1234, PLAT-5678' } })])
    );
    expect(delta.results).toEqual([
      { testId: 1001, caseId: 2001, statusId: 5, defects: 'PLAT-1234, PLAT-5678' },
    ]);
  });

  // TestRail rejects a result with nothing but defects on it, so a defect added on its own
  // has to restate the status the row already carries.
  it('restates the current status for a defect added on its own', () => {
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 5 },
      draft: { defects: ' PLAT-1234 ' },
    });
    const delta = computeDelta(snapshot([stored]));
    expect(delta.results).toEqual([
      { testId: 1001, caseId: 2001, defects: 'PLAT-1234', statusId: 5 },
    ]);
    expect(delta.blockedDefects).toEqual([]);
  });

  it('does not restate a status when the defect already travels with a comment', () => {
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 5 },
      draft: { defects: 'PLAT-1234', comment: 'log attached' },
    });
    const delta = computeDelta(snapshot([stored]));
    expect(delta.results).toEqual([
      { testId: 1001, caseId: 2001, comment: 'log attached', defects: 'PLAT-1234' },
    ]);
  });

  it('blocks a defect on an Untested row, which has no status to restate', () => {
    const delta = computeDelta(snapshot([storedTest({ draft: { defects: 'PLAT-1234' } })]));
    expect(delta.results).toEqual([]);
    expect(delta.blockedDefects).toEqual([{ testId: 1001, caseId: 2001, title: 'success login' }]);
  });

  it('still applies a case edit on a row whose defect is blocked', () => {
    const delta = computeDelta(
      snapshot([storedTest({ draft: { defects: 'PLAT-1234', priorityId: 4 } })])
    );
    expect(delta.blockedDefects).toHaveLength(1);
    expect(delta.caseEdits).toEqual([{ testId: 1001, caseId: 2001, fields: { priority_id: 4 } }]);
  });

  it('leaves a whitespace-only defect out of the delta', () => {
    const delta = computeDelta(snapshot([storedTest({ draft: { defects: '   ' } })]));
    expect(delta.results).toEqual([]);
    expect(delta.blockedDefects).toEqual([]);
  });

  it('blocks the defect when the drafted status was Untested and skipped', () => {
    const stored = storedTest({
      remote: { ...storedTest().remote, statusId: 5 },
      draft: { statusId: 3, defects: 'PLAT-1234' },
    });
    const delta = computeDelta(snapshot([stored]));
    expect(delta.skippedUntested).toHaveLength(1);
    expect(delta.results).toEqual([]);
    expect(delta.blockedDefects).toHaveLength(1);
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

  it('exposes the drafted defect and the one last pushed', () => {
    const view = toView(
      snapshot([
        storedTest({
          remote: { ...storedTest().remote, lastResultDefects: 'PLAT-1' },
          draft: { defects: 'PLAT-2' },
        }),
      ])
    );
    expect(view.tests[0].defects).toBe('PLAT-2');
    expect(view.tests[0].lastResultDefects).toBe('PLAT-1');
    expect(view.tests[0].dirtyFields).toEqual(['defects']);
  });

  it('exposes the folder name and its full path', () => {
    const view = toView(
      snapshot([
        storedTest({ remote: { ...storedTest().remote, folder: 'Android', folderPath: 'Campaign / Android' } }),
      ])
    );
    expect(view.tests[0].folder).toBe('Android');
    expect(view.tests[0].folderPath).toBe('Campaign / Android');
  });

  it('reports an unresolved folder as null rather than omitting it', () => {
    const view = toView(snapshot([storedTest()]));
    expect(view.tests[0].folder).toBeNull();
    expect(view.tests[0].folderPath).toBeNull();
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

describe('requiredResultDefaults', () => {
  const field = (name, options, context = { is_global: true, project_ids: [] }) => ({
    system_name: name,
    configs: [{ context, options }],
  });

  it('sends the configured default for a required field', () => {
    const defaults = requiredResultDefaults(
      [field('custom_reusable', { is_required: true, default_value: '2' })],
      184
    );
    expect(defaults).toEqual({ custom_reusable: 2 });
  });

  it('ignores fields that are not required', () => {
    const defaults = requiredResultDefaults(
      [field('custom_version', { is_required: false, default_value: '7' })],
      184
    );
    expect(defaults).toEqual({});
  });

  it('omits a required field that has no usable default rather than inventing one', () => {
    const defaults = requiredResultDefaults(
      [
        field('quality_rating', { is_required: true }),
        field('custom_notes', { is_required: true, default_value: '' }),
      ],
      184
    );
    expect(defaults).toEqual({});
  });

  it('keeps non-numeric defaults as text', () => {
    const defaults = requiredResultDefaults(
      [field('custom_env', { is_required: true, default_value: 'staging' })],
      184
    );
    expect(defaults).toEqual({ custom_env: 'staging' });
  });

  it('applies a project-scoped field only to that project', () => {
    const scoped = [
      field(
        'custom_squad',
        { is_required: true, default_value: '3' },
        { is_global: false, project_ids: [184] }
      ),
    ];
    expect(requiredResultDefaults(scoped, 184)).toEqual({ custom_squad: 3 });
    expect(requiredResultDefaults(scoped, 999)).toEqual({});
  });

  it('tolerates missing or malformed field metadata', () => {
    expect(requiredResultDefaults(undefined, 184)).toEqual({});
    expect(requiredResultDefaults([{}, { system_name: 'custom_x' }], 184)).toEqual({});
  });
});
