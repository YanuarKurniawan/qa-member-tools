const fs = require("fs");
const csvParser = require("csv-parser");
const fetch = require("node-fetch");
const pLimit = require("p-limit");
require("dotenv").config();

// const fs = require("fs");
// const csvParser = require("csv-parser");
// const pLimit = require("p-limit");
// const fetch = require("node-fetch");

// ------------------- CONFIG -------------------
const TESTRAIL_BASE_URL = process.env.TESTRAIL_BASE_URL;
const USERNAME = process.env.TESTRAIL_USER;
const PASS= process.env.TESTRAIL_PASS;
const CSV_FILE_PATH = "./second batch.csv";
const BATCH_SIZE = 10; // number of concurrent requests
const RATE_LIMIT = 150; // requests per minute
const RATE_WAIT_MS = 60000; // wait 1 minute when limit reached
// ---------------------------------------------

// Function to update a single test case
async function updateTestCase(caseId, preconds, expected) {

  let requestCount = 0;

  const url = `${TESTRAIL_BASE_URL}/index.php?/api/v2/update_case/${caseId}`;
  const body = {
    custom_preconds: preconds,
    custom_expected: expected,
  };

  const auth = 'Basic ' + Buffer.from(`${USERNAME}:${PASS}`).toString("base64");

//   console.log(
//     "CURL:",
//     `curl -u ${USERNAME}:${PASS} -X POST "${url}" ` +
//       `-H "Content-Type: application/json" ` +
//       `-d '{}'`
//   );

  requestCount++;
  if (requestCount >= RATE_LIMIT) {
    console.log(`Reached ${RATE_LIMIT} requests, waiting for 1 minute...`);
    await new Promise((res) => setTimeout(res, RATE_WAIT_MS));
    requestCount = 0; // reset counter
  }


  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error updating case ${caseId}: ${text}`);
    } else {
      console.log(`Case ${caseId} updated successfully.`);
    }
  } catch (err) {
    throw new Error(`Error updating case ${caseId}: ${err.message}`);

  }
}

// Read CSV into memory first
const rows = [];
fs.createReadStream(CSV_FILE_PATH)
  .pipe(csvParser())
  .on("data", (row) => rows.push(row))
  .on("end", async () => {
    console.log(`CSV loaded. ${rows.length} cases to update.`);

    const limit = pLimit(BATCH_SIZE);

    // Map rows to promises with concurrency limit
    const promises = rows.map((row) =>
      limit(() => {
        const caseId = row.ID.trim();
        const preconds = row.Precond || "";
        // const steps = row.Steps || "";
        const expected = row.Results || "";
        return updateTestCase(caseId, preconds, expected);
      })
    );

    // Wait for all updates to finish
    await Promise.all(promises);

    console.log("All updates completed.");
  });
