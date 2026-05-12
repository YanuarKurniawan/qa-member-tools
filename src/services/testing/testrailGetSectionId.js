const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

function testrailHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.TESTRAIL_USER}:${config.TESTRAIL_API_KEY}`).toString('base64');
  return { 'Content-Type': 'application/json', Authorization: auth };
}

module.exports = async function testrailGetSectionId({ rows, options, onLog }) {
  const { projectId, suiteId, parentId } = options;

  if (!config.TESTRAIL_USER || !config.TESTRAIL_API_KEY) {
    throw new Error('TestRail credentials not configured');
  }

  const limit = 250;
  let offset = 0;
  const allMatches = [];

  while (true) {
    const url = `${config.TESTRAIL_BASE_URL}/index.php?/api/v2/get_sections/${projectId}&suite_id=${suiteId}&limit=${limit}&offset=${offset}`;
    onLog.info(`Fetching sections (offset: ${offset})`);

    const sectRes = await fetch(url, { headers: testrailHeaders() });
    if (!sectRes.ok) {
      onLog.error(`API error: ${sectRes.status}`);
      break;
    }

    const data = await sectRes.json();
    const sections = data.sections || [];

    if (sections.length === 0) break;

    const matches = sections.filter((s) => Number(s.parent_id) === Number(parentId));
    onLog.info(`Found ${matches.length} matches in batch (offset ${offset})`);
    allMatches.push(...matches.map((m) => ({ id: m.id, name: m.name })));

    if (sections.length < limit) break;
    offset += limit;
    await sleep(300);
  }

  onLog.success(`Total sections found: ${allMatches.length}`);
  return { results: allMatches };
};
