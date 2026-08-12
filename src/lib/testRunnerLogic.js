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

function draftDefects(test) {
  const value = (test.draft || {}).defects;
  return typeof value === 'string' ? value.trim() : '';
}

function dirtyFields(test) {
  const draft = test.draft || {};
  const fields = [];
  if ('statusId' in draft && draft.statusId !== test.remote.statusId) fields.push('statusId');
  if ('priorityId' in draft && draft.priorityId !== test.remote.priorityId) fields.push('priorityId');
  if ('title' in draft && draft.title !== baseTitle(test)) fields.push('title');
  if (draftComment(test)) fields.push('comment');
  if (draftDefects(test)) fields.push('defects');
  return fields;
}

function isDirty(test) {
  return dirtyFields(test).length > 0;
}

// Turns a section into { name, path } by walking up its parents: name is the folder the
// case sits in, path is the trail from the top of the suite down to it. sectionsById holds
// already-fetched sections, with null for any that could not be read.
function folderFromSections(sectionId, sectionsById) {
  const trail = [];
  const visited = new Set();
  let cursor = sectionsById.get(sectionId);

  // visited also guards against a malformed parent chain looping forever.
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    trail.unshift(cursor.name);
    cursor = cursor.parent_id == null ? null : sectionsById.get(cursor.parent_id);
  }

  if (trail.length === 0) return null;
  return { name: trail[trail.length - 1], path: trail.join(' / ') };
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
        // A case always lives in a section, so an unknown folder means the lookup failed
        // rather than the case moving to the root. Keep what the last sync established.
        folder: incoming.remote.folder || (prev.remote && prev.remote.folder) || null,
        folderPath: incoming.remote.folderPath || (prev.remote && prev.remote.folderPath) || null,
        lastResultComment: (prev.remote && prev.remote.lastResultComment) || null,
        lastResultDefects: (prev.remote && prev.remote.lastResultDefects) || null,
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
  const blockedDefects = [];
  const untested = untestedStatusId(snapshot);

  for (const test of Object.values(snapshot.tests)) {
    const draft = test.draft || {};
    const comment = draftComment(test);
    const defects = draftDefects(test);
    let pushStatus = 'statusId' in draft && draft.statusId !== test.remote.statusId;

    if (pushStatus && draft.statusId === untested) {
      skippedUntested.push({ testId: test.testId, caseId: test.caseId, title: effectiveTitle(test) });
      pushStatus = false;
    }

    if (pushStatus || comment || defects) {
      const entry = { testId: test.testId, caseId: test.caseId };
      if (pushStatus) entry.statusId = draft.statusId;
      if (comment) entry.comment = comment;
      if (defects) entry.defects = defects;

      // TestRail rejects a result carrying only defects: one of status, comment or assignee
      // must be present. Restate the status the row already shows, which is what linking a
      // defect in TestRail's own UI does. An Untested row has no status it can restate.
      let blocked = false;
      if (defects && !pushStatus && !comment) {
        const current = 'statusId' in draft ? draft.statusId : test.remote.statusId;
        if (current === untested) {
          blockedDefects.push({ testId: test.testId, caseId: test.caseId, title: effectiveTitle(test) });
          blocked = true;
        } else {
          entry.statusId = current;
        }
      }

      if (!blocked) results.push(entry);
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

  return { results, caseEdits, skippedUntested, blockedDefects };
}

// A TestRail instance can mark result fields required instance-wide, and it rejects
// add_results_for_cases outright when one is missing. We cannot invent values, so we
// send each required field's own configured default — the same value TestRail's web UI
// pre-selects. Required fields with no default are left out for TestRail to rule on.
function requiredResultDefaults(resultFields, projectId) {
  const defaults = {};

  for (const field of resultFields || []) {
    const name = field.system_name;
    if (!name) continue;

    for (const config of field.configs || []) {
      const context = config.context || {};
      const applies =
        Boolean(context.is_global) || (context.project_ids || []).includes(projectId);
      if (!applies) continue;

      const options = config.options || {};
      if (!options.is_required) continue;

      const fallback = options.default_value;
      if (fallback === undefined || fallback === null || fallback === '') break;

      defaults[name] = /^-?\d+$/.test(String(fallback)) ? Number(fallback) : fallback;
      break;
    }
  }

  return defaults;
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
        folder: test.remote.folder || null,
        folderPath: test.remote.folderPath || null,
        statusId: 'statusId' in draft ? draft.statusId : test.remote.statusId,
        remoteStatusId: test.remote.statusId,
        priorityId: 'priorityId' in draft ? draft.priorityId : test.remote.priorityId,
        comment: typeof draft.comment === 'string' ? draft.comment : '',
        defects: typeof draft.defects === 'string' ? draft.defects : '',
        refs: test.remote.refs || null,
        dirtyFields: dirtyFields(test),
        conflicts: test.conflicts || [],
        uploadError: test.uploadError || null,
        titleDivergedFromRun: Boolean(test.caseTitle && test.caseTitle !== test.remote.title),
        lastResultComment: test.remote.lastResultComment || null,
        lastResultDefects: test.remote.lastResultDefects || null,
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
  untestedStatusId,
  folderFromSections,
  mergeSnapshot,
  computeDelta,
  requiredResultDefaults,
  toView,
};
