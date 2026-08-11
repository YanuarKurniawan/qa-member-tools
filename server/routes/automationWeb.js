const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { refreshAutomationWeb } = require('../../src/lib/automationWeb');

const DATA_FILE = path.join(__dirname, '../data/automationWeb.json');

// Return the current snapshot.
router.get('/', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) {
    return res.status(404).json({
      error: 'No snapshot yet. Refresh from the UI or run: node scripts/refreshAutomationWeb.js',
      lastUpdated: null,
    });
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Failed to read snapshot: ${err.message}` });
  }
});

// Re-pull sources live and write a fresh snapshot.
// Optional body:
//   - { only: 'googleSheet' | 'jira' | 'testrail' } to refresh a single source
//   - { jiraDone, jiraTotal } for when JIRA_API_TOKEN is not set
router.post('/refresh', async (req, res) => {
  try {
    const { jiraDone = null, jiraTotal = null, only = null } = req.body || {};
    const snapshot = await refreshAutomationWeb({ jiraDone, jiraTotal, only });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: `Refresh failed: ${err.message}` });
  }
});

module.exports = router;
