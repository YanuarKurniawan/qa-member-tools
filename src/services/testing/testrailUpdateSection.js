const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

function testrailHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`).toString('base64');
  return { 'Content-Type': 'application/json', Authorization: auth };
}

module.exports = async function testrailUpdateSection({ rows, options, onLog }) {
  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new Error('TestRail credentials not configured');
  }

  onLog.info(`Loaded ${rows.length} sections to update`);
  const results = [];

  for (const row of rows) {
    const sectionId = row.id;
    const name = row.name;

    try {
      onLog.info(`Updating section ${sectionId}: "${name}"`);
      const updateRes = await fetch(
        `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/update_section/${sectionId}`,
        {
          method: 'POST',
          headers: testrailHeaders(),
          body: JSON.stringify({ name }),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        onLog.error(`Section ${sectionId} failed: ${errText}`);
        results.push({ id: sectionId, name, status: 'ERROR' });
      } else {
        onLog.success(`Section ${sectionId} updated`);
        results.push({ id: sectionId, name, status: 'SUCCESS' });
      }
      await sleep(300);
    } catch (err) {
      onLog.error(`Section ${sectionId} error: ${err.message}`);
      results.push({ id: sectionId, name, status: 'ERROR' });
    }
  }

  return { results };
};
