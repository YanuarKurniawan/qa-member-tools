const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

const TESTRAIL_LINK_PATTERN = /https:\/\/tiket\.testrail\.com\/index\.php\?\/cases\/view\/\d+/gi;

function jiraHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64');
  return { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' };
}

module.exports = async function getTestrailLink({ rows, options, onLog }) {
  if (!config.JIRA_EMAIL || !config.JIRA_API_TOKEN) {
    throw new Error('JIRA_EMAIL and JIRA_API_TOKEN must be set in .env');
  }

  onLog.info(`Processing ${rows.length} issues`);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const issueKey = rows[i].issueKey || rows[i].jiraId;
    if (!issueKey) {
      onLog.warn(`Row ${i + 1}: missing issueKey`);
      results.push({ ...rows[i], testRailLink: '' });
      continue;
    }

    try {
      onLog.info(`[${i + 1}/${rows.length}] Processing ${issueKey}`);
      const jiraRes = await fetch(
        `${config.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}?fields=description`,
        { headers: jiraHeaders() }
      );
      const jiraData = await jiraRes.json();
      let testRailLink = '';

      if (jiraData?.fields?.description) {
        const desc = typeof jiraData.fields.description === 'object'
          ? JSON.stringify(jiraData.fields.description)
          : jiraData.fields.description;
        const matches = desc.match(TESTRAIL_LINK_PATTERN);
        testRailLink = matches ? matches[0] : '';
      }

      onLog.success(`${issueKey}: ${testRailLink || 'No link found'}`);
      results.push({ ...rows[i], testRailLink });
      await sleep(500);
    } catch (err) {
      onLog.error(`Error processing ${issueKey}: ${err.message}`);
      results.push({ ...rows[i], testRailLink: `ERROR: ${err.message}` });
    }
  }

  return { results };
};
