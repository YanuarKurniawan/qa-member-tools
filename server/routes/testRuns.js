const express = require('express');
const router = express.Router();
const runner = require('../../src/lib/testRunner');

function resolveRunId(req, res) {
  const runId = runner.parseRunId(req.params.runId);
  if (!runId) {
    res.status(400).json({ error: `Invalid run id: ${req.params.runId}` });
    return null;
  }
  return runId;
}

function resolveTestId(req, res) {
  const testId = Number(req.params.testId);
  if (!Number.isInteger(testId)) {
    res.status(400).json({ error: `Invalid test id: ${req.params.testId}` });
    return null;
  }
  return testId;
}

function notSyncedResponse(res, runId) {
  return res.status(404).json({ error: `Run ${runId} has not been synced yet`, runId });
}

router.get('/', (req, res) => {
  try {
    res.json({ runs: runner.listRecentRuns() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:runId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const state = runner.loadRun(runId);
    if (!state) {
      return notSyncedResponse(res, runId);
    }
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:runId/sync', async (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const { state, summary } = await runner.syncRun(runId);
    res.json({ ...state, summary });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.patch('/:runId/tests/:testId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  const testId = resolveTestId(req, res);
  if (!testId) return;
  const patch = req.body || {};
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No fields supplied' });
  }
  if (!runner.loadRun(runId)) {
    return notSyncedResponse(res, runId);
  }
  try {
    res.json(runner.saveDraft(runId, testId, patch));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:runId/tests/:testId', (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  const testId = resolveTestId(req, res);
  if (!testId) return;
  if (!runner.loadRun(runId)) {
    return notSyncedResponse(res, runId);
  }
  try {
    res.json(runner.getCaseDetail(runId, testId));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/:runId/upload', async (req, res) => {
  const runId = resolveRunId(req, res);
  if (!runId) return;
  try {
    const outcome = await runner.uploadRun(runId);
    const { state } = await runner.syncRun(runId);
    res.json({ outcome, state });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
