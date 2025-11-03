const fs = require('fs');const fs = require('fs');const fs = require('fs');

const csv = require('csv-parser');

const fetch = require('node-fetch');const csv = require('csv-parser');const csv = require('csv-parser');

const path = require('path');

const fetch = require('node-fetch');const fetch = require('node-fetch');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const path = require('path');

// --- CONFIGURATION ---

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const JIRA_EMAIL = process.env.JIRA_EMAIL;

const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;require('dotenv').config({ path: path.resolve(__dirname, '../.env') });



if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {// --- CONFIGURATION ---

  console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');

  process.exit(1);// --- CONFIGURATION ---const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

}

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;const JIRA_EMAIL = process.env.JIRA_EMAIL;

const LOG_FILE = 'jira_transition_log.txt';

const MAX_RETRIES = 3;const JIRA_EMAIL = process.env.JIRA_EMAIL;const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const STATUS_FLOW = ['TODO', 'Product Done', 'In Development', 'Code Review', 'Dev done', 'Ready for QA', 'In QA', 'QA done', 'In Product UAT', 'UAT Done', 'Ready Deploy (PROD)', 'Done'];

const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// --- CLI FLAGS ---

const args = process.argv.slice(2);if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

const csvPath = args[0];

const isDryRun = args.includes('--dry-run');if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');



// --- AUTH HEADER ---    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');    process.exit(1);

const headers = {

  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),    process.exit(1);}

  'Accept': 'application/json',

  'Content-Type': 'application/json'}const LOG_FILE = 'jira_transition_log.txt';

};

const LOG_FILE = 'jira_transition_log.txt';const MAX_RETRIES = 3;

// --- UTILITY FUNCTIONS ---

function logToFile(message) {const MAX_RETRIES = 3;const STATUS_FLOW = ['TODO', 'Product Done', 'In Development', 'Code Review', 'Dev done', 'Ready for QA', 'In QA', 'QA done', 'In Product UAT', 'UAT Done', 'Ready Deploy (PROD)', 'Done']

  const timestamp = new Date().toISOString();

  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);const STATUS_FLOW = ['TODO', 'Product Done', 'In Development', 'Code Review', 'Dev done', 'Ready for QA', 'In QA', 'QA done', 'In Product UAT', 'UAT Done', 'Ready Deploy (PROD)', 'Done']

}

// --- CLI FLAGS ---

async function getIssueStatus(issueKey) {

  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}?fields=status`, {// --- CLI FLAGS ---const args = process.argv.slice(2);

    method: 'GET',

    headersconst args = process.argv.slice(2);const csvPath = args[0];

  });

  const data = await res.json();const csvPath = args[0];const isDryRun = args.includes('--dry-run');

  return data.fields?.status?.name;

}const isDryRun = args.includes('--dry-run');



async function getAvailableTransitions(issueKey) {// --- AUTH HEADER ---

  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {

    method: 'GET',// --- AUTH HEADER ---const headers = {

    headers

  });const headers = {  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),

  const data = await res.json();

  return data.transitions || [];  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),  'Accept': 'application/json',

}

  'Accept': 'application/json',  'Content-Type': 'application/json'

async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {

  if (isDryRun) {  'Content-Type': 'application/json'};

    const msg = `[DRY RUN] Would transition ${issueKey} to "${targetStatus}" (transition ID: ${transitionId})`;

    console.log(msg);};

    logToFile(msg);

    return;// --- UTILITY FUNCTIONS ---

  }

// --- UTILITY FUNCTIONS ---function logToFile(message) {

  try {

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {function logToFile(message) {  const timestamp = new Date().toISOString();

      method: 'POST',

      headers,  const timestamp = new Date().toISOString();  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);

      body: JSON.stringify({ transition: { id: transitionId } })

    });  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);}



    if (!res.ok) throw new Error(`Status ${res.status}`);}



    const msg = `✅ Transitioned ${issueKey} to "${targetStatus}"`;async function getIssueStatus(issueKey) {

    console.log(msg);

    logToFile(msg);async function getIssueStatus(issueKey) {  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}?fields=status`, {

  } catch (err) {

    if (retries < MAX_RETRIES) {  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}?fields=status`, {    method: 'GET',

      const msg = `🔁 Retry ${retries + 1} for ${issueKey} to "${targetStatus}" due to: ${err.message}`;

      console.warn(msg);    method: 'GET',    headers

      logToFile(msg);

      await performTransition(issueKey, transitionId, targetStatus, retries + 1);    headers  });

    } else {

      const msg = `❌ Failed to transition ${issueKey} to "${targetStatus}" after ${MAX_RETRIES} attempts`;  });  const data = await res.json();

      console.error(msg);

      logToFile(msg);  const data = await res.json();  return data.fields?.status?.name;

    }

  }  return data.fields?.status?.name;}

}

}

async function smartTransition(issueKey, currentStatus, targetStatus) {

  const currentIndex = STATUS_FLOW.indexOf(currentStatus);async function getAvailableTransitions(issueKey) {

  const targetIndex = STATUS_FLOW.indexOf(targetStatus);

async function getAvailableTransitions(issueKey) {  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {

  if (currentIndex === -1 || targetIndex === -1) {

    const msg = `❌ Invalid current (${currentStatus}) or target (${targetStatus}) status for ${issueKey}`;  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {    method: 'GET',

    console.error(msg);

    logToFile(msg);    method: 'GET',    headers

    return;

  }    headers  });



  if (currentIndex > targetIndex) {  });  const data = await res.json();

    const msg = `⚠️ ${issueKey} is already past "${targetStatus}" (current: "${currentStatus}")`;

    console.log(msg);  const data = await res.json();  return data.transitions || [];

    logToFile(msg);

    return;  return data.transitions || [];}

  }

}

  for (let i = currentIndex + 1; i <= targetIndex; i++) {

    const nextStatus = STATUS_FLOW[i];async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {

    const transitions = await getAvailableTransitions(issueKey);

    const transition = transitions.find(t => t.to.name.toLowerCase() === nextStatus.toLowerCase());async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {  if (isDryRun) {



    if (!transition) {  if (isDryRun) {    const msg = `[DRY RUN] Would transition ${issueKey} to "${targetStatus}" (transition ID: ${transitionId})`;

      const msg = `❌ No transition from "${STATUS_FLOW[i - 1]}" to "${nextStatus}" found for ${issueKey}`;

      console.error(msg);    const msg = `[DRY RUN] Would transition ${issueKey} to "${targetStatus}" (transition ID: ${transitionId})`;    console.log(msg);

      logToFile(msg);

      return;    console.log(msg);    logToFile(msg);

    }

    logToFile(msg);    return;

    await performTransition(issueKey, transition.id, nextStatus);

  }    return;  }

}

  }

function processCSV(filePath) {

  const results = [];  try {



  fs.createReadStream(filePath)  try {    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {

    .pipe(csv())

    .on('data', data => results.push(data))    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {      method: 'POST',

    .on('end', async () => {

      for (const { issueKey, targetTransitionName } of results) {      method: 'POST',      headers,

        const currentStatus = await getIssueStatus(issueKey);

      headers,      body: JSON.stringify({ transition: { id: transitionId } })

        if (!currentStatus) {

          const msg = `❌ Could not fetch current status for ${issueKey}`;      body: JSON.stringify({ transition: { id: transitionId } })    });

          console.error(msg);

          logToFile(msg);    });

          continue;

        }    if (!res.ok) throw new Error(`Status ${res.status}`);



        if (currentStatus === targetTransitionName) {    if (!res.ok) throw new Error(`Status ${res.status}`);

          const msg = `✅ ${issueKey} is already in "${targetTransitionName}"`;

          console.log(msg);    const msg = `✅ Transitioned ${issueKey} to "${targetStatus}"`;

          logToFile(msg);

          continue;    const msg = `✅ Transitioned ${issueKey} to "${targetStatus}"`;    console.log(msg);

        }

    console.log(msg);    logToFile(msg);

        await smartTransition(issueKey, currentStatus, targetTransitionName);

      }    logToFile(msg);  } catch (err) {



      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);  } catch (err) {    if (retries < MAX_RETRIES) {

    });

}    if (retries < MAX_RETRIES) {      const msg = `🔁 Retry ${retries + 1} for ${issueKey} to "${targetStatus}" due to: ${err.message}`;



// --- MAIN ---      const msg = `🔁 Retry ${retries + 1} for ${issueKey} to "${targetStatus}" due to: ${err.message}`;      console.warn(msg);

if (!csvPath) {

  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');      console.warn(msg);      logToFile(msg);

  process.exit(1);

}      logToFile(msg);      await performTransition(issueKey, transitionId, targetStatus, retries + 1);



processCSV(csvPath);      await performTransition(issueKey, transitionId, targetStatus, retries + 1);    } else {

    } else {      const msg = `❌ Failed to transition ${issueKey} to "${targetStatus}" after ${MAX_RETRIES} attempts`;

      const msg = `❌ Failed to transition ${issueKey} to "${targetStatus}" after ${MAX_RETRIES} attempts`;      console.error(msg);

      console.error(msg);      logToFile(msg);

      logToFile(msg);    }

    }  }

  }}

}

async function smartTransition(issueKey, currentStatus, targetStatus) {

async function smartTransition(issueKey, currentStatus, targetStatus) {  const currentIndex = STATUS_FLOW.indexOf(currentStatus);

  const currentIndex = STATUS_FLOW.indexOf(currentStatus);  const targetIndex = STATUS_FLOW.indexOf(targetStatus);

  const targetIndex = STATUS_FLOW.indexOf(targetStatus);

  if (currentIndex === -1 || targetIndex === -1) {

  if (currentIndex === -1 || targetIndex === -1) {    const msg = `❌ Invalid current (${currentStatus}) or target (${targetStatus}) status for ${issueKey}`;

    const msg = `❌ Invalid current (${currentStatus}) or target (${targetStatus}) status for ${issueKey}`;    console.error(msg);

    console.error(msg);    logToFile(msg);

    logToFile(msg);    return;

    return;  }

  }

  if (currentIndex > targetIndex) {

  if (currentIndex > targetIndex) {    const msg = `⚠️ ${issueKey} is already past "${targetStatus}" (current: "${currentStatus}")`;

    const msg = `⚠️ ${issueKey} is already past "${targetStatus}" (current: "${currentStatus}")`;    console.log(msg);

    console.log(msg);    logToFile(msg);

    logToFile(msg);    return;

    return;  }

  }

  for (let i = currentIndex + 1; i <= targetIndex; i++) {

  for (let i = currentIndex + 1; i <= targetIndex; i++) {    const nextStatus = STATUS_FLOW[i];

    const nextStatus = STATUS_FLOW[i];    const transitions = await getAvailableTransitions(issueKey);

    const transitions = await getAvailableTransitions(issueKey);    const transition = transitions.find(t => t.to.name.toLowerCase() === nextStatus.toLowerCase());

    const transition = transitions.find(t => t.to.name.toLowerCase() === nextStatus.toLowerCase());

    if (!transition) {

    if (!transition) {      const msg = `❌ No transition from "${STATUS_FLOW[i - 1]}" to "${nextStatus}" found for ${issueKey}`;

      const msg = `❌ No transition from "${STATUS_FLOW[i - 1]}" to "${nextStatus}" found for ${issueKey}`;      console.error(msg);

      console.error(msg);      logToFile(msg);

      logToFile(msg);      return;

      return;    }

    }

    await performTransition(issueKey, transition.id, nextStatus);

    await performTransition(issueKey, transition.id, nextStatus);  }

  }}

}

function processCSV(filePath) {

function processCSV(filePath) {  const results = [];

  const results = [];

  fs.createReadStream(filePath)

  fs.createReadStream(filePath)    .pipe(csv())

    .pipe(csv())    .on('data', data => results.push(data))

    .on('data', data => results.push(data))    .on('end', async () => {

    .on('end', async () => {      for (const { issueKey, targetTransitionName } of results) {

      for (const { issueKey, targetTransitionName } of results) {        const currentStatus = await getIssueStatus(issueKey);

        const currentStatus = await getIssueStatus(issueKey);

        if (!currentStatus) {

        if (!currentStatus) {          const msg = `❌ Could not fetch current status for ${issueKey}`;

          const msg = `❌ Could not fetch current status for ${issueKey}`;          console.error(msg);

          console.error(msg);          logToFile(msg);

          logToFile(msg);          continue;

          continue;        }

        }

        if (currentStatus === targetTransitionName) {

        if (currentStatus === targetTransitionName) {          const msg = `✅ ${issueKey} is already in "${targetTransitionName}"`;

          const msg = `✅ ${issueKey} is already in "${targetTransitionName}"`;          console.log(msg);

          console.log(msg);          logToFile(msg);

          logToFile(msg);          continue;

          continue;        }

        }

        await smartTransition(issueKey, currentStatus, targetTransitionName);

        await smartTransition(issueKey, currentStatus, targetTransitionName);      }

      }

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);    });

    });}

}

// --- MAIN ---

// --- MAIN ---if (!csvPath) {

if (!csvPath) {  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');

  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');  process.exit(1);

  process.exit(1);}

}

processCSV(csvPath);

processCSV(csvPath);