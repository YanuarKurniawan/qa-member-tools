const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

function testrailHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`).toString('base64');
  return { 'Content-Type': 'application/json', Authorization: auth };
}

module.exports = async function testrailAddSection({ rows, options, onLog }) {
  const { projectId, parentId, suiteId } = options;

  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new Error('TestRail credentials not configured in .env');
  }

  onLog.info(`Processing ${rows.length} sections`);
  const results = [];

  for (const row of rows) {
    try {
      onLog.info(`Adding section: ${row.foldername}`);
      const addRes = await fetch(
        `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/add_section/${projectId}`,
        {
          method: 'POST',
          headers: testrailHeaders(),
          body: JSON.stringify({
            suite_id: Number(suiteId),
            name: row.foldername,
            description: row.endpoint,
            parent_id: Number(parentId),
          }),
        }
      );
      const data = await addRes.json();
      const id = data?.id || '';
      onLog.success(`Added section "${row.foldername}" with ID: ${id}`);
      results.push({ foldername: row.foldername, endpoint: row.endpoint, id, status: 'SUCCESS' });
      await sleep(700);
    } catch (err) {
      onLog.error(`Failed to add "${row.foldername}": ${err.message}`);
      results.push({ foldername: row.foldername, endpoint: row.endpoint, id: '', status: 'ERROR' });
    }
  }

  return { results };
};
