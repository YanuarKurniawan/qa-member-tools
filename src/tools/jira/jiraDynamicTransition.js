require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const path = require('path');

// --- CONFIGURATION ---
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const MAX_RETRIES = 3;
const LOG_FILE = `jira-transition-log-${Date.now()}.txt`;

// --- CLI FLAGS ---
const [, , csvPath, ...flags] = process.argv;
const isDryRun = flags.includes('--dry-run');

// Validate configuration
if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');
  process.exit(1);
}

// --- AUTH HEADER ---
const headers = {
  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

// --- UTILITY FUNCTIONS ---
function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

async function getIssueStatus(issueKey) {
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}?fields=status`, {
    method: 'GET',
    headers
  });
  const data = await res.json();
  return data.fields?.status?.name;
}

async function getAvailableTransitions(issueKey) {
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/transitions`, {
    method: 'GET',
    headers
  });
  const data = await res.json();
  return data.transitions || [];
}

async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {
  if (isDryRun) {
    const msg = `[DRY RUN] Would transition ${issueKey} using transition ID ${transitionId}`;
    console.log(msg);
    logToFile(msg);
    return;
  }

  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transition: { id: transitionId } })
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);

    const msg = `Transitioned ${issueKey} using transition ID ${transitionId}`;
    console.log(msg);
    logToFile(msg);
  } catch (err) {
    if (retries < MAX_RETRIES) {
      const msg = `Failed to transition ${issueKey}, retrying... (${err.message})`;
      console.warn(msg);
      logToFile(msg);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
      await performTransition(issueKey, transitionId, targetStatus, retries + 1);
    } else {
      const msg = `Failed to transition ${issueKey} after ${MAX_RETRIES} attempts: ${err.message}`;
      console.error(msg);
      logToFile(msg);
    }
  }
}

async function smartTransition(issueKey, currentStatus, targetStatus) {
  const WORKFLOW_STATES = ['To Do', 'In Progress', 'In Review', 'Done'];
  const currentIndex = WORKFLOW_STATES.indexOf(currentStatus);
  const targetIndex = WORKFLOW_STATES.indexOf(targetStatus);

  if (currentIndex === -1 || targetIndex === -1) {
    const msg = `Invalid status transition ${currentStatus} → ${targetStatus}`;
    console.error(msg);
    logToFile(msg);
    return;
  }

  if (currentIndex > targetIndex) {
    const msg = `Cannot move backwards in workflow: ${currentStatus} → ${targetStatus}`;
    console.log(msg);
    logToFile(msg);
    return;
  }

  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const nextStatus = WORKFLOW_STATES[i];
    const transitions = await getAvailableTransitions(issueKey);
    const transition = transitions.find(t => t.to.name === nextStatus);

    if (!transition) {
      const msg = `No transition found for ${issueKey} to status ${nextStatus}`;
      console.error(msg);
      logToFile(msg);
      return;
    }

    await performTransition(issueKey, transition.id, nextStatus);
  }
}

function processCSV(filePath) {
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', data => results.push(data))
    .on('end', async () => {
      for (const row of results) {
        const { issueKey, targetTransitionName } = row;
        const currentStatus = await getIssueStatus(issueKey);

        if (!currentStatus) {
          const msg = `Could not get current status for ${issueKey}`;
          console.error(msg);
          logToFile(msg);
          continue;
        }

        if (currentStatus === targetTransitionName) {
          const msg = `${issueKey} already in target status ${targetTransitionName}`;
          console.log(msg);
          logToFile(msg);
          continue;
        }

        await smartTransition(issueKey, currentStatus, targetTransitionName);
      }

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);
    });
}

// --- MAIN ---
if (!csvPath) {
  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');
  process.exit(1);
}

processCSV(csvPath);