const fs = require("fs");const fs = require("fs");const fs = require("fs");

const path = require("path");

const csv = require("csv-parser");const path = require("path");const path = require("path");

const fetch = require("node-fetch");

const csv = require("csv-parser");const csv = require("csv-parser");

// === CLI Arguments ===

const args = process.argv.slice(2);const fetch = require("node-fetch");const fetch = require("node-fetch");

const csvFile = args[0];

const isDryRun = args.includes("--dry-run");



// === Validation ===// === CLI Arguments ===// === CLI Arguments ===

if (!csvFile) {

  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");const args = process.argv.slice(2);const args = process.argv.slice(2);

  process.exit(1);

}const csvFile = args[0];const csvFile = args[0];



require('dotenv').config({ path: path.resolve(__dirname, '../.env') });const isDryRun = args.includes("--dry-run");const isDryRun = args.includes("--dry-run");



// === Jira Configuration ===

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

const JIRA_EMAIL = process.env.JIRA_EMAIL;// === Validation ===// === Validation ===

const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!csvFile) {if (!csvFile) {

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

  console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");

  process.exit(1);

}  process.exit(1);  process.exit(1);



// === Logging Setup ===}}

const logFileName = `jira-update-log-${Date.now()}.txt`;

const logStream = fs.createWriteStream(logFileName, { flags: "a" });



function log(message) {require('dotenv').config({ path: path.resolve(__dirname, '../.env') });require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

  const timestamp = new Date().toISOString();

  const fullMessage = `[${timestamp}] ${message}`;

  console.log(fullMessage);

  logStream.write(fullMessage + "\n");// === Jira Configuration ===// === Jira Configuration ===

}

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

// === Jira Update ===

async function updateIssue(issueKey, payload) {const JIRA_EMAIL = process.env.JIRA_EMAIL;const JIRA_EMAIL = process.env.JIRA_EMAIL;

  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`;

  const body = JSON.stringify({ fields: payload });const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;



  const response = await fetch(url, {

    method: "PUT",

    headers: {if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

      Authorization: "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),

      "Content-Type": "application/json",    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');

      Accept: "application/json"

    },    process.exit(1);    process.exit(1);

    body

  });}}



  return response;

}

// === Logging Setup ===// === Logging Setup ===

// === Process CSV and do the thing===

fs.createReadStream(csvFile)const logFileName = `jira-update-log-${Date.now()}.txt`;const logFileName = `jira-update-log-${Date.now()}.txt`;

  .pipe(csv())

  .on("data", async (row) => {const logStream = fs.createWriteStream(logFileName, { flags: "a" });const logStream = fs.createWriteStream(logFileName, { flags: "a" });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const issueKey = row.issueKey?.trim();

    const parentId = row.parent?.trim();

function log(message) {function log(message) {

    if (!issueKey || !parentId) {

      log(`⚠️ Skipping row — missing IssueKey or parent`);  const timestamp = new Date().toISOString();  const timestamp = new Date().toISOString();

      return;

    }  const fullMessage = `[${timestamp}] ${message}`;  const fullMessage = `[${timestamp}] ${message}`;



    const payload = {  console.log(fullMessage);  console.log(fullMessage);

      parent: { key: parentId }

    };  logStream.write(fullMessage + "\n");  logStream.write(fullMessage + "\n");



    log(`${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(payload)}`);}}



    if (!isDryRun) {

      try {

        let res;// === Jira Update ===// === Jira Update ===

        let attempts = 0;

        const maxAttempts = 3;async function updateIssue(issueKey, payload) {async function updateIssue(issueKey, payload) {



        while (attempts < maxAttempts) {  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`;  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`;

          res = await updateIssue(issueKey, payload);

  const body = JSON.stringify({ fields: payload });  const body = JSON.stringify({ fields: payload });

          if (res.status === 429) {

            attempts++;

            const retryAfter = res.headers.get("retry-after");

            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;  const response = await fetch(url, {  const response = await fetch(url, {

            log(`⏳ Rate limit hit for ${issueKey}. Retrying in ${waitTime / 1000}s (Attempt ${attempts}/${maxAttempts})`);

            await new Promise((resolve) => setTimeout(resolve, waitTime));    method: "PUT",    method: "PUT",

          } else {

            break;    headers: {    headers: {

          }

        }      Authorization:      Authorization:



        if (res.ok) {        "Basic " +        "Basic " +

          log(`✅ ${issueKey} updated successfully`);

        } else {        Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),        Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),

          let errorText;

          try {      "Content-Type": "application/json",      "Content-Type": "application/json",

            errorText = await res.text();

            try {      Accept: "application/json",      Accept: "application/json",

              const json = JSON.parse(errorText);

              errorText = JSON.stringify(json);    },    },

            } catch (e) {}

          } catch (e) {    body,    body,

            errorText = `Unable to read error response: ${e.message}`;

          }  });  });

          log(`❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`);

        }

      } catch (e) {

        log(`❌ Network error for ${issueKey}: ${e.message}`);  return response;  return response;

      }

    }}}

  })

  .on("end", () => {

    log("✅ CSV processing complete.");

    logStream.end();// === Process CSV and do the thing===// === Process CSV and do the thing===

  });
fs.createReadStream(csvFile)fs.createReadStream(csvFile)

  .pipe(csv())  .pipe(csv())

  .on("data", async (row) => {  .on("data", async (row) => {

    await new Promise((resolve) => setTimeout(resolve, 500));    await new Promise((resolve) => setTimeout(resolve, 500));

    const issueKey = row.issueKey?.trim();    const issueKey = row.issueKey?.trim();

    const parentId = row.parent?.trim();    const parentId = row.parent?.trim();

    // const labelsRaw = row.labels?.trim();

    if (!issueKey || !parentId) {

      log(`⚠️ Skipping row — missing IssueKey or parent`);    if (!issueKey || !parentId) {

      return;      log(`⚠️ Skipping row — missing IssueKey or parent`);

    }      return;

    }

    const payload = {

      parent: { key: parentId },    const payload = {

    };      parent: { key: parentId },

    };

    log(

      `${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(    // let payload = {};

        payload    // const labels = labelsRaw

      )}`    //   .split(",")

    );    //   .map((l) => l.trim())

    //   .filter(Boolean);

    if (!isDryRun) {    // if (labels.length > 0) {

      try {    //   payload.labels = labels;

        let res;    // }

        let attempts = 0;    // if (labelsRaw) {

        const maxAttempts = 3;    //   const labels = labelsRaw

    //     .split(",")

        while (attempts < maxAttempts) {    //     .map((l) => l.trim())

          res = await updateIssue(issueKey, payload);    //     .filter(Boolean);

    //   if (labels.length > 0) {

          if (res.status === 429) {    //     payload.labels = labels;

            attempts++;    //   }

            const retryAfter = res.headers.get("retry-after");    // }

            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

            log(    log(

              `⏳ Rate limit hit for ${issueKey}. Retrying in ${      `${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(

                waitTime / 1000        payload

              }s (Attempt ${attempts}/${maxAttempts})`      )}`

            );    );

            await new Promise((resolve) => setTimeout(resolve, waitTime));

          } else {    if (!isDryRun) {

            break;      try {

          }        let res;

        }        let attempts = 0;

        const maxAttempts = 3;

        if (res.ok) {

          log(`✅ ${issueKey} updated successfully`);        while (attempts < maxAttempts) {

        } else {          res = await updateIssue(issueKey, payload);

          let errorText;

          try {          if (res.status === 429) {

            errorText = await res.text();            attempts++;

            try {            const retryAfter = res.headers.get("retry-after");

              const json = JSON.parse(errorText);            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

              errorText = JSON.stringify(json);            log(

            } catch (e) {}              `⏳ Rate limit hit for ${issueKey}. Retrying in ${

          } catch (e) {                waitTime / 1000

            errorText = `Unable to read error response: ${e.message}`;              }s (Attempt ${attempts}/${maxAttempts})`

          }            );

          log(            await new Promise((resolve) => setTimeout(resolve, waitTime));

            `❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`          } else {

          );            break;

        }          }

      } catch (e) {        }

        log(`❌ Network error for ${issueKey}: ${e.message}`);

      }        if (res.ok) {

    }          log(`✅ ${issueKey} updated successfully`);

  })        } else {

  .on("end", () => {          let errorText;

    log("✅ CSV processing complete.");          try {

    logStream.end();            errorText = await res.text();

  });            try {
              const json = JSON.parse(errorText);
              errorText = JSON.stringify(json);
            } catch (e) {}
          } catch (e) {
            errorText = `Unable to read error response: ${e.message}`;
          }
          log(
            `❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`
          );
        }
      } catch (e) {
        log(`❌ Network error for ${issueKey}: ${e.message}`);
      }
    }
  })
  .on("end", () => {
    log("✅ CSV processing complete.");
    logStream.end();
  });
