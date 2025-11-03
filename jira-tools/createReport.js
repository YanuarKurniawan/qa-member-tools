const fs = require("fs");

// Node.js 18+ (run with `node report.js`)

const BASE_URL = "https://tiket.testrail.io";
const API_USER = "yanuar.kurniawan@tiket.com";
const API_KEY = ".bFunKReNRIzu0et4GCg-EUoTFF3W4vYu9e4ol9/g";
const PROJECT_ID = 184;

// Run created between (inclusive)
const runStart = Math.floor(new Date("2025-06-01").getTime() / 1000);
const runEnd   = Math.floor(new Date("2025-07-31").getTime() / 1000);

// Tests executed between (inclusive)
const execStart = Math.floor(new Date("2025-07-01").getTime() / 1000);
const execEnd   = Math.floor(new Date("2025-07-31").getTime() / 1000);

// ================= LOGGING =================
function log(message, data) {
  const timestamp = new Date().toISOString();
  let entry = `[${timestamp}] ${message}`;
  if (data !== undefined) {
    entry += " " + JSON.stringify(data, null, 2);
  }
  console.log(entry);
  fs.appendFileSync("log.log", entry + "\n", "utf8");
}

// ================= API CALLER =================
async function apiGet(endpoint) {
  log(`Calling API: ${endpoint}`);
  const res = await fetch(`${BASE_URL}/index.php?/api/v2/${endpoint}`, {
    headers: {
      "Authorization":
        "Basic " +
        Buffer.from(`${API_USER}:${API_KEY}`).toString("base64"),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    log(`❌ API error on ${endpoint}`, text);
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  log(`✅ Response from ${endpoint}`, json);
  return json;
}

// ================= MAIN =================
(async () => {
  try {
    let executedCount = 0;

    // 1. Get all runs
    const runsResponse = await apiGet(`get_runs/${PROJECT_ID}`);
    const runs = runsResponse.runs || [];
    log("Filtered runs window", { runStart, runEnd });
    const filteredRuns = runs.filter(
      (run) => run.created_on >= runStart && run.created_on <= runEnd
    );
    log("Filtered runs", filteredRuns.length);

    for (const run of filteredRuns) {
      log(`Processing run ${run.id}`, run);

      // 2. Get tests in this run
      const testsResponse = await apiGet(`get_tests/${run.id}`);
      const tests = testsResponse.tests || [];

      for (const test of tests) {
        // 3. Get results for this test
        const resultsResponse = await apiGet(`get_results/${test.id}`);
        const results =
          resultsResponse.results || resultsResponse || [];

        for (const result of results) {
          if (
            result.status_id !== 3 && // not Untested
            result.created_on >= execStart &&
            result.created_on <= execEnd
          ) {
            executedCount++;
            log(
              `✔ Counted test ${test.id} from run ${run.id}`,
              result
            );
            break; // only count once per test
          }
        }
      }
    }

    log(
      `🎯 Final result: Executed cases (runs created between Jun 1 – Jul 31, executed between Jul 1 – Jul 31):`,
      { executedCount }
    );
  } catch (err) {
    log("❌ Error occurred", err.message);
    console.error(err);
  }
})();

