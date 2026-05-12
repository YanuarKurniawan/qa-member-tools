const sleep = require('../../lib/sleep');

module.exports = async function upgradeTier({ rows, options, onLog }) {
  onLog.info(`Loaded ${rows.length} users from CSV`);
  const results = [];

  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5).map((r) => ({
      accountId: Number(r.accountId),
      targetLevel: r.Level,
    }));
    onLog.info(`Processing batch ${Math.floor(i / 5) + 1}: ${batch.length} users`);

    try {
      const upgradeRes = await fetch(
        'https://loyalty-core-be-svc.preprod-platform-cluster.tiket.com/tix-loyalty-core/user/upgrade-tier',
        {
          method: 'POST',
          headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            'X-Channel-Id': 'DESKTOP',
            'X-Currency': 'idr',
            'X-Request-Id': 'automaton-upgrade',
            'X-Service-Id': 'gateway',
            'X-Store-Id': 'TIKETCOM',
            'X-Username': 'system',
          },
          body: JSON.stringify({
            tierUpgradeSpecifications: batch,
            upgradeType: 'SERVICE_UPGRADE',
          }),
        }
      );
      const data = await upgradeRes.json();
      const batchNum = Math.floor(i / 5) + 1;

      if (!upgradeRes.ok || (data.code && data.code !== 'SUCCESS')) {
        onLog.error(`Batch ${batchNum} failed: ${data.code || upgradeRes.status}`);
        batch.forEach((b) =>
          results.push({ accountId: b.accountId, Level: b.targetLevel, status: 'ERROR', error: data.code || String(upgradeRes.status) })
        );
      } else {
        onLog.success(`Batch ${batchNum} completed`);
        batch.forEach((b) =>
          results.push({ accountId: b.accountId, Level: b.targetLevel, status: 'SUCCESS' })
        );
      }
    } catch (err) {
      onLog.error(`Batch ${Math.floor(i / 5) + 1} failed: ${err.message}`);
      batch.forEach((b) =>
        results.push({ accountId: b.accountId, Level: b.targetLevel, status: 'ERROR' })
      );
    }
  }

  return { results };
};
