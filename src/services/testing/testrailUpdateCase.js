const config = require('../../lib/config');

function testrailHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`).toString('base64');
  return { 'Content-Type': 'application/json', Authorization: auth };
}

module.exports = async function testrailUpdateCase({ rows, options, onLog }) {
  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new Error('TestRail credentials not configured');
  }

  onLog.info(`Loaded ${rows.length} cases to update`);
  const results = [];
  const BATCH_SIZE = 10;

  const processCase = async (row) => {
    const caseId = (row.ID || '').trim();
    const preconds = row.Precond || '';
    const expected = row.Results || '';

    try {
      const updateRes = await fetch(
        `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/update_case/${caseId}`,
        {
          method: 'POST',
          headers: testrailHeaders(),
          body: JSON.stringify({ custom_preconds: preconds, custom_expected: expected }),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        onLog.error(`Case ${caseId} failed: ${errText}`);
        results.push({ ID: caseId, status: 'ERROR', error: errText });
      } else {
        onLog.success(`Case ${caseId} updated`);
        results.push({ ID: caseId, status: 'SUCCESS' });
      }
    } catch (err) {
      onLog.error(`Case ${caseId} error: ${err.message}`);
      results.push({ ID: caseId, status: 'ERROR', error: err.message });
    }
  };

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(processCase));
    onLog.info(`Processed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }

  onLog.success(`Update complete: ${results.filter((r) => r.status === 'SUCCESS').length} succeeded`);
  return { results };
};
