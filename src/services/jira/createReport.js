const config = require('../../lib/config');

module.exports = async function createReport({ rows, options, onLog }) {
  const { projectId, runStart, runEnd, execStart, execEnd } = options;

  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new Error('TestRail credentials not configured');
  }

  const auth = 'Basic ' + Buffer.from(`${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`).toString('base64');

  const runStartTs = Math.floor(new Date(runStart).getTime() / 1000);
  const runEndTs = Math.floor(new Date(runEnd).getTime() / 1000);
  const execStartTs = Math.floor(new Date(execStart).getTime() / 1000);
  const execEndTs = Math.floor(new Date(execEnd).getTime() / 1000);

  onLog.info(`Fetching runs for project ${projectId}`);
  const runsRes = await fetch(
    `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/get_runs/${projectId}`,
    { headers: { Authorization: auth, 'Content-Type': 'application/json' } }
  );
  const runsData = await runsRes.json();
  const runs = runsData.runs || [];

  const filteredRuns = runs.filter(
    (r) => r.created_on >= runStartTs && r.created_on <= runEndTs
  );
  onLog.info(`Found ${filteredRuns.length} runs in date range`);

  let executedCount = 0;

  for (const run of filteredRuns) {
    onLog.info(`Processing run ${run.id}: ${run.name}`);
    const testsRes = await fetch(
      `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/get_tests/${run.id}`,
      { headers: { Authorization: auth, 'Content-Type': 'application/json' } }
    );
    const testsData = await testsRes.json();
    const tests = testsData.tests || [];

    for (const test of tests) {
      const resultsRes = await fetch(
        `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/get_results/${test.id}`,
        { headers: { Authorization: auth, 'Content-Type': 'application/json' } }
      );
      const resultsData = await resultsRes.json();
      const testResults = resultsData.results || resultsData || [];

      for (const result of testResults) {
        if (
          result.status_id !== 3 &&
          result.created_on >= execStartTs &&
          result.created_on <= execEndTs
        ) {
          executedCount++;
          break;
        }
      }
    }
  }

  onLog.success(`Total executed cases: ${executedCount}`);
  return {
    results: [{ projectId, executedCount, runsProcessed: filteredRuns.length }],
    message: `Executed cases count: ${executedCount}`,
  };
};
