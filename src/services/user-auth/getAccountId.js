const sleep = require('../../lib/sleep');

const ENV_CONFIG = {
  test: {
    accountIdUrl: 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
  },
  preprod: {
    accountIdUrl: 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
  },
};

module.exports = async function getAccountId({ rows, options, onLog }) {
  const { env = 'test', memberType = 'B2C' } = options;
  const envConfig = ENV_CONFIG[env];

  if (!envConfig) throw new Error('Invalid environment. Use "test" or "preprod"');

  onLog.info(`Processing ${rows.length} rows`);
  const results = [];

  for (const row of rows) {
    const email = row.email || row.Email;

    if (!email) {
      onLog.warn('Skipping row with missing email');
      results.push({ ...row, accountId: '', status: 'SKIPPED', error: 'Missing email' });
      continue;
    }

    try {
      onLog.info(`Fetching account ID for: ${email}`);

      const url = `${envConfig.accountIdUrl}?memberType=${memberType}&by=EMAIL&value=${encodeURIComponent(email)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'X-Store-Id': 'TIKETCOM',
          'X-Channel-Id': 'WEB',
          'X-Service-Id': 'gateway',
          'X-Request-Id': '8599a603-bf86-4222-a2e7-9c1df4a25bbe',
          'X-Username': 'username',
          'X-Account-Id': '0',
          'Accept-Language': 'id',
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      const accountId = data?.data?.accountId;

      if (accountId) {
        onLog.success(`Account ID for ${email}: ${accountId}`);
        results.push({ ...row, accountId, status: 'SUCCESS' });
      } else {
        onLog.warn(`No account ID found for ${email}`);
        results.push({ ...row, accountId: '', status: 'NOT_FOUND', error: 'Account not found' });
      }
    } catch (err) {
      onLog.error(`Error fetching account ID for ${email}: ${err.message}`);
      results.push({ ...row, accountId: '', status: 'ERROR', error: err.message });
    }

    await sleep(500);
  }

  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  onLog.success(`Completed. ${successCount}/${rows.length} accounts found`);

  return { results };
};
