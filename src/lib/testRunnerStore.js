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
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastSyncedAt).localeCompare(String(a.lastSyncedAt)))
    .slice(0, limit);
}

module.exports = { readSnapshot, writeSnapshot, listSnapshots, snapshotPath };
