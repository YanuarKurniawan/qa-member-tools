require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const fs = require("fs");
const csv = require("csv-parser");
const fetch = require("node-fetch");
const path = require("path");

// === CLI Arguments ===
const [, , csvFile, ...flags] = process.argv;
const isDryRun = flags.includes("--dry-run");
const logStream = fs.createWriteStream(`jira-update-log-${Date.now()}.txt`);

// === Validation ===
if (!csvFile) {
  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");
  process.exit(1);
}

// === Jira Configuration ===
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error(
    "Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file"
  );
  process.exit(1);
}

// === Logging Setup ===
function log(message) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] ${message}`;
  console.log(fullMessage);
  logStream.write(fullMessage + "\n");
}

// === Jira Update ===
async function updateIssue(issueKey, body) {
  const response = await fetch(
    `${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`,
    {
      method: "PUT",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  return response;
}

// === Process CSV and do the thing===
fs.createReadStream(csvFile)
  .pipe(csv())
  .on("data", async (row) => {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const { issueKey, parentId } = row;

    if (!issueKey || !parentId) {
      log(`⚠️ Skipping row — missing IssueKey or parent`);
      return;
    }

    const payload = {
      parent: { key: parentId },
    };

    log(
      `${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(
        payload
      )}`
    );

    if (!isDryRun) {
      try {
        let res;
        let attempts = 0;
        const maxAttempts = 3;
        const waitTime = 5000;

        while (attempts < maxAttempts) {
          res = await updateIssue(issueKey, payload);

          if (res.status === 429) {
            attempts++;

            log(
              `⏳ Rate limit hit for ${issueKey}. Retrying in ${
                waitTime / 1000
              }s (Attempt ${attempts}/${maxAttempts})`
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          } else {
            break;
          }
        }

        if (res.ok) {
          log(`✅ ${issueKey} updated successfully`);
        } else {
          let errorText;
          try {
            errorText = await res.text();
            try {
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
