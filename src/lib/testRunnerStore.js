const fs = require('fs');
const path = require('path');
const logic = require('./testRunnerLogic');

const DATA_DIR = path.join(__dirname, '../../server/data/testRuns');

function snapshotPath(runId) {
  return path.join(DATA_DIR, `${Number(runId)}.json`);
}

function readSnapshot(runId) {
  const file = snapshotPath(runId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Written tmp-then-rename so a crash mid-write cannot corrupt existing drafts.
function writeSnapshot(runId, snapshot) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = snapshotPath(runId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Removes the local copy only. TestRail keeps every result already uploaded; re-entering
// the run id pulls the run back, minus any drafts that were never pushed.
function deleteSnapshot(runId) {
  const file = snapshotPath(runId);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

// Progress is read from what TestRail last reported, not from drafts, so the run list
// separates "how far the run has got" from "what you have not uploaded yet".
function runProgress(snapshot) {
  const untested = logic.untestedStatusId(snapshot);
  const tests = Object.values(snapshot.tests || {});
  return {
    total: tests.length,
    executed: tests.filter((test) => test.remote && test.remote.statusId !== untested).length,
  };
}

function listSnapshots(limit = 8) {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => {
      try {
        const snapshot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
        return {
          runId: snapshot.runId,
          runName: snapshot.runName,
          lastSyncedAt: snapshot.lastSyncedAt,
          dirtyCount: Object.values(snapshot.tests || {}).filter(logic.isDirty).length,
          ...runProgress(snapshot),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastSyncedAt).localeCompare(String(a.lastSyncedAt)))
    .slice(0, limit);
}

module.exports = { readSnapshot, writeSnapshot, deleteSnapshot, listSnapshots, snapshotPath };
