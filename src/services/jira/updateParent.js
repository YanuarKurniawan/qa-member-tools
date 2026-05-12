const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

function jiraHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64');
  return { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' };
}

module.exports = async function updateParent({ rows, options, onLog }) {
  const dryRun = options.dryRun === 'true' || options.dryRun === true;

  if (!config.JIRA_EMAIL || !config.JIRA_API_TOKEN) {
    throw new Error('JIRA credentials not configured');
  }

  onLog.info(`Processing ${rows.length} issues${dryRun ? ' (DRY RUN)' : ''}`);
  const results = [];

  for (const row of rows) {
    const { issueKey, parentId } = row;
    if (!issueKey || !parentId) {
      onLog.warn('Skipping row — missing issueKey or parentId');
      continue;
    }

    const payload = { parent: { key: parentId } };
    onLog.info(`${dryRun ? '[DRY RUN]' : '[UPDATE]'} ${issueKey} → parent: ${parentId}`);

    if (!dryRun) {
      let attempts = 0;
      let success = false;

      while (attempts < 3) {
        const updateRes = await fetch(
          `${config.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`,
          { method: 'PUT', headers: jiraHeaders(), body: JSON.stringify(payload) }
        );

        if (updateRes.status === 429) {
          attempts++;
          onLog.warn(`Rate limit for ${issueKey}, retrying in 5s (${attempts}/3)`);
          await sleep(5000);
        } else if (updateRes.ok) {
          onLog.success(`${issueKey} updated`);
          success = true;
          break;
        } else {
          const errText = await updateRes.text();
          onLog.error(`Failed ${issueKey}: HTTP ${updateRes.status} — ${errText}`);
          break;
        }
      }

      results.push({ issueKey, parentId, status: success ? 'UPDATED' : 'FAILED' });
    } else {
      results.push({ issueKey, parentId, status: 'DRY_RUN' });
    }

    await sleep(500);
  }

  return { results };
};
