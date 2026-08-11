const sleep = require('../../lib/sleep');

const ENV_CONFIG = {
  gk: {
    baseUrl: 'https://mission-be-svc.test-platform-cluster.tiket.com',
  },
  preprod: {
    baseUrl: 'https://mission-be-svc.preprod-platform-cluster.tiket.com',
  },
};

async function setupReward(baseUrl, topSpenderId, welcomeCoins, onLog) {
  const url = `${baseUrl}/tix-mission/api/admin/top-spender/${topSpenderId}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'id',
      'X-Account-Id': '123456',
      'X-Channel-Id': 'MICROSERVICE',
      'X-Request-Id': `setup-reward-${Date.now()}`,
      'X-Service-Id': 'loyalty',
      'X-Store-Id': 'TIKETCOM',
      'X-Username': 'admin@tiket.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: topSpenderId,
      name: 'TS - 2026 Active Long (renamed)',
      startAt: '2025-12-31T17:00:00Z',
      endAt: '2027-01-31T16:59:59Z',
      status: 'ACTIVE',
      welcomeBonusCoins: Number(welcomeCoins),
      description: 'Updated description for QA',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.errors?.[0]?.message || data?.message || JSON.stringify(data);
    throw new Error(`Setup reward failed (${res.status}): ${errMsg}`);
  }

  return data;
}

module.exports = async function joinTopSpender({ rows, options, onLog, signal }) {
  const env = options.env || 'gk';
  const config = ENV_CONFIG[env];
  if (!config) {
    onLog.error(`Unknown environment: ${env}`);
    return { results: [] };
  }

  const topSpenderId = options.topSpenderId;
  if (!topSpenderId) {
    onLog.error('Top Spender ID is required');
    return { results: [] };
  }

  const shouldSetupReward = options.setupReward === 'true' || options.setupReward === true;
  const joinUrl = `${config.baseUrl}/tix-mission/api/top-spender/${topSpenderId}/join`;

  onLog.info(`Environment: ${env === 'gk' ? 'GK (Gatotkaca)' : 'Preprod'}`);
  onLog.info(`Top Spender ID: ${topSpenderId}`);
  onLog.info(`Set Up Reward: ${shouldSetupReward ? 'Yes' : 'No'}`);
  onLog.info(`Loaded ${rows.length} accounts from CSV`);

  const results = [];

  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) {
      onLog.warn(`Process stopped by user at row ${i + 1}/${rows.length}`);
      break;
    }

    const row = rows[i];
    const accountId = row.accountId;

    if (!accountId) {
      onLog.error(`[${i + 1}/${rows.length}] Missing accountId`);
      results.push({ ...row, status: 'ERROR', error: 'Missing accountId' });
      continue;
    }

    try {
      onLog.info(`[${i + 1}/${rows.length}] Processing accountId: ${accountId}`);

      if (shouldSetupReward) {
        const welcomeCoins = row.welcomeCoins;
        if (!welcomeCoins) {
          onLog.error(`[${i + 1}/${rows.length}] Missing welcomeCoins for accountId ${accountId}`);
          results.push({ ...row, status: 'ERROR', error: 'Missing welcomeCoins' });
          continue;
        }

        onLog.info(`[${i + 1}/${rows.length}] Setting up reward (${welcomeCoins} coins)...`);
        await setupReward(config.baseUrl, topSpenderId, welcomeCoins, onLog);
        onLog.success(`[${i + 1}/${rows.length}] Reward set: ${welcomeCoins} coins`);

        await sleep(500);
      }

      onLog.info(`[${i + 1}/${rows.length}] Joining Top Spender...`);
      const res = await fetch(joinUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'id',
          'X-Account-Id': String(accountId),
          'X-Channel-Id': 'MICROSERVICE',
          'X-Request-Id': `join-topspender-${accountId}-${Date.now()}`,
          'X-Service-Id': 'loyalty',
          'X-Store-Id': 'TIKETCOM',
          'X-Username': 'username',
          'X-Currency': 'idr',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ acceptTnc: true }),
      });

      const data = await res.json();

      if (res.ok) {
        onLog.success(`[${i + 1}/${rows.length}] Joined: accountId ${accountId}`);
        results.push({ ...row, status: 'SUCCESS', httpStatus: res.status, response: JSON.stringify(data) });
      } else {
        const errMsg = data?.errors?.[0]?.message || data?.message || JSON.stringify(data);
        onLog.warn(`[${i + 1}/${rows.length}] Failed: accountId ${accountId} — ${res.status} ${errMsg}`);
        results.push({ ...row, status: 'FAILED', httpStatus: res.status, error: errMsg });
      }
    } catch (err) {
      onLog.error(`[${i + 1}/${rows.length}] Error: accountId ${accountId} — ${err.message}`);
      results.push({ ...row, status: 'ERROR', error: err.message });
    }

    if (i < rows.length - 1) {
      await sleep(1000);
    }
  }

  const succeeded = results.filter(r => r.status === 'SUCCESS').length;
  const stopped = signal?.aborted;
  onLog.success(`Join Top Spender ${stopped ? 'stopped' : 'complete'}. ${succeeded}/${rows.length} succeeded`);
  return { results };
};
