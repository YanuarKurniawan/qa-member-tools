const sleep = require('../../lib/sleep');
const crypto = require('crypto');

let faker;
async function loadFaker() {
  if (!faker) {
    const mod = await import('@faker-js/faker');
    faker = mod.faker;
  }
  return faker;
}

const PROFILE_ENV_CONFIG = {
  test: 'https://profile-core-be-svc.test-platform-cluster.tiket.com',
  preprod: 'https://profile-core-be-svc.preprod-platform-cluster.tiket.com',
};

module.exports = async function injectProfile({ rows, options, onLog }) {
  const { accountId, count, env } = options;

  if (!accountId) throw new Error('accountId is required');

  const profileCount = Math.max(1, parseInt(count, 10) || 1);
  const baseUrl = PROFILE_ENV_CONFIG[env];

  if (!baseUrl) throw new Error('Invalid environment. Choose "test" or "preprod".');

  const url = `${baseUrl}/tix-profile-core/profiles`;
  onLog.info(`Injecting ${profileCount} profile(s) for accountId ${accountId} on ${env}`);

  await loadFaker();

  const results = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < profileCount; i++) {
    const firstName = faker.person.firstName().replace(/[^a-zA-Z ]/g, '');
    const lastName = faker.person.lastName().replace(/[^a-zA-Z ]/g, '');

    try {
      onLog.info(`[${i + 1}/${profileCount}] Creating profile: ${firstName} ${lastName}`);

      const profileRes = await fetch(url, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'X-Account-Id': String(accountId),
          'storeId': 'TIKETCOM',
          'channelId': 'WEB',
          'serviceId': 'gateway',
          'requestId': crypto.randomUUID(),
          'username': 'username',
          'memberType': 'B2C',
          'lang': 'id',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: Number(accountId),
          isPrimary: false,
          accountSalutationName: 'MR',
          accountFirstName: firstName,
          accountLastName: lastName,
          accountPhone: '77712384123',
          accountPhoneCode: '+62',
          accountEmail: 'mail@mail.com',
        }),
      });

      const data = await profileRes.json();

      if (profileRes.ok) {
        onLog.success(`[${i + 1}/${profileCount}] Created: ${firstName} ${lastName}`);
        results.push({ index: i + 1, firstName, lastName, status: 'SUCCESS', response: data.code || 'OK' });
      } else {
        onLog.error(`[${i + 1}/${profileCount}] Failed: ${data.code || profileRes.status}`);
        results.push({ index: i + 1, firstName, lastName, status: 'ERROR', response: data.code || String(profileRes.status) });
      }
    } catch (err) {
      onLog.error(`[${i + 1}/${profileCount}] Error: ${err.message}`);
      results.push({ index: i + 1, firstName, lastName, status: 'ERROR', response: err.message });
    }

    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < profileCount) {
      onLog.info(`Batch of ${BATCH_SIZE} done, pausing 1s...`);
      await sleep(1000);
    }
  }

  const successCount = results.filter((r) => r.status === 'SUCCESS').length;
  onLog.success(`Done. ${successCount}/${profileCount} profiles created.`);
  return { results };
};
