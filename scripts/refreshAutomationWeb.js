#!/usr/bin/env node
/**
 * CLI wrapper for the Automation WEB dashboard refresh.
 *
 * The actual fetch logic lives in src/lib/automationWeb.js (shared with the
 * server refresh endpoint). This just parses args and prints a summary.
 *
 * Usage:
 *   node scripts/refreshAutomationWeb.js
 *   node scripts/refreshAutomationWeb.js --jira-done=65 --jira-total=112
 *   node scripts/refreshAutomationWeb.js --only=jira        # refresh one source
 */

const path = require('path');
const { refreshAutomationWeb, OUTPUT_FILE } = require('../src/lib/automationWeb');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const jiraDone = args['jira-done'] != null ? Number(args['jira-done']) : null;
  const jiraTotal = args['jira-total'] != null ? Number(args['jira-total']) : null;
  const only = args['only'] ? args['only'].split(',').map((s) => s.trim()) : null;

  console.log(`Refreshing Automation WEB dashboard${only ? ` (only: ${only.join(', ')})` : ''}...\n`);

  const snapshot = await refreshAutomationWeb({
    jiraDone,
    jiraTotal,
    only,
    onLog: (msg) => console.log(`  • ${msg}`),
  });

  const r = snapshot.reconciliation;
  console.log(
    `\n  Reconciliation: sheet=${r.counts.googleSheet}, jira=${r.counts.jira}, testrail=${r.counts.testrail} ` +
      `→ ${r.allMatch ? 'ALL MATCH' : `spread ${r.spread}`}`
  );
  console.log(`  Wrote ${path.relative(process.cwd(), OUTPUT_FILE)} (lastUpdated ${snapshot.lastUpdated})`);

  if (snapshot.errors) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nRefresh failed:', err.message);
  process.exit(1);
});
