const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

const WORKFLOW_STATES = ['To Do', 'In Progress', 'In Review', 'Done'];

function jiraHeaders() {
  const auth = 'Basic ' + Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64');
  return { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' };
}

module.exports = async function dynamicTransition({ rows, options, onLog }) {
  const dryRun = options.dryRun === 'true' || options.dryRun === true;

  if (!config.JIRA_EMAIL || !config.JIRA_API_TOKEN) {
    throw new Error('JIRA credentials not configured');
  }

  onLog.info(`Processing ${rows.length} issues${dryRun ? ' (DRY RUN)' : ''}`);
  const results = [];

  for (const row of rows) {
    const { issueKey, targetTransitionName } = row;

    const statusRes = await fetch(
      `${config.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}?fields=status`,
      { headers: jiraHeaders() }
    );
    const statusData = await statusRes.json();
    const currentStatus = statusData?.fields?.status?.name;

    if (!currentStatus) {
      onLog.error(`Could not get status for ${issueKey}`);
      results.push({ issueKey, status: 'ERROR' });
      continue;
    }

    if (currentStatus === targetTransitionName) {
      onLog.info(`${issueKey} already at ${targetTransitionName}`);
      results.push({ issueKey, from: currentStatus, to: targetTransitionName, status: 'ALREADY_THERE' });
      continue;
    }

    const currentIdx = WORKFLOW_STATES.indexOf(currentStatus);
    const targetIdx = WORKFLOW_STATES.indexOf(targetTransitionName);

    if (currentIdx === -1 || targetIdx === -1) {
      onLog.error(`Invalid states: ${currentStatus} → ${targetTransitionName}`);
      results.push({ issueKey, status: 'INVALID_STATE' });
      continue;
    }

    if (currentIdx > targetIdx) {
      onLog.warn(`Cannot move backwards: ${currentStatus} → ${targetTransitionName}`);
      results.push({ issueKey, status: 'CANNOT_MOVE_BACK' });
      continue;
    }

    let transitionSuccess = true;
    for (let i = currentIdx + 1; i <= targetIdx; i++) {
      const nextStatus = WORKFLOW_STATES[i];
      const transRes = await fetch(
        `${config.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/transitions`,
        { headers: jiraHeaders() }
      );
      const transData = await transRes.json();
      const transition = (transData.transitions || []).find((t) => t.to.name === nextStatus);

      if (!transition) {
        onLog.error(`No transition for ${issueKey} to ${nextStatus}`);
        transitionSuccess = false;
        break;
      }

      if (dryRun) {
        onLog.info(`[DRY RUN] Would transition ${issueKey} to ${nextStatus}`);
      } else {
        const doRes = await fetch(
          `${config.JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/transitions`,
          {
            method: 'POST',
            headers: jiraHeaders(),
            body: JSON.stringify({ transition: { id: transition.id } }),
          }
        );
        if (!doRes.ok) {
          onLog.error(`Failed transition ${issueKey} to ${nextStatus}`);
          transitionSuccess = false;
          break;
        }
        onLog.success(`Transitioned ${issueKey} to ${nextStatus}`);
      }
    }

    results.push({
      issueKey,
      from: currentStatus,
      to: targetTransitionName,
      status: transitionSuccess ? (dryRun ? 'DRY_RUN' : 'SUCCESS') : 'FAILED',
    });
  }

  return { results };
};
