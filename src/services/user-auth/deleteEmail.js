const httpClient = require('../../lib/httpClient');
const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

const ENV_CONFIG = {
  test: {
    userDataUrl: 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account',
    deleteEmailUrl: 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/backfill/set-null-email',
    unmUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/tools/update-user-identity',
    get unmHeaders() {
      return {
        'X-Challenge': config.UNM_TEST_CHALLENGE,
        'X-Challenge-Signature': config.UNM_TEST_CHALLENGE_SIGNATURE,
        'X-Username': config.UNM_TEST_USERNAME,
      };
    },
  },
  preprod: {
    userDataUrl: 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/account',
    deleteEmailUrl: 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/backfill/set-null-email',
    unmUrl: 'https://sandbox.eph.bliblitiket.tools/gks-unm-go-be/api/v1/tools/update-user-identity',
    get unmHeaders() {
      return {
        'X-Challenge': config.UNM_PREPROD_CHALLENGE,
        'X-Challenge-Signature': config.UNM_PREPROD_CHALLENGE_SIGNATURE,
        'X-Username': config.UNM_PREPROD_USERNAME,
      };
    },
  },
};

const commonHeaders = {
  accept: '*/*',
  'Accept-Language': 'id',
  'True-Client-Ip': '127.0.0.1',
  'X-Account-Id': '0',
  'X-Business-Id': '0',
  'X-Channel-Id': 'DESKTOP',
  'X-Currency': 'idr',
  'X-Forwarded-For': '127.0.0.1',
  'X-Identity': 'identity',
  'X-Login-Media': 'none',
  'X-Request-Id': 'automation-tool',
  'X-Reseller-Id': '0',
  'X-Service-Id': 'gateway',
  'X-Store-Id': 'TIKETCOM',
  'X-Username': 'GUEST',
  'Content-Type': 'application/json',
};

module.exports = {
  preview: async function deleteEmailPreview({ rows, options, onLog }) {
    const { email, env = 'test' } = options;
    const envConfig = ENV_CONFIG[env];

    if (!email) throw new Error('Email is required');
    if (!envConfig) throw new Error('Invalid environment. Use "test" or "preprod"');

    onLog.info(`Looking up user data for: ${email}`);
    const userRes = await httpClient.get(envConfig.userDataUrl, {
      headers: { ...commonHeaders, 'X-Username': email },
    });

    if (!userRes.data?.data) {
      onLog.error(`User not found: ${email}`);
      throw new Error('User not found');
    }

    const { accountId, accountPhoneCode, accountPhoneNumber, accountUsername, unmUserId } = userRes.data.data;
    onLog.success(`Found user: accountId=${accountId}, phone=${accountPhoneCode}${accountPhoneNumber}`);

    return {
      preview: true,
      userData: { accountId, accountPhoneCode, accountPhoneNumber, accountUsername, unmUserId },
    };
  },

  confirm: async function deleteEmailConfirm({ rows, options, onLog }) {
    const { accountId, accountPhoneCode, accountPhoneNumber, accountUsername, unmUserId, env = 'test' } = options;
    const envConfig = ENV_CONFIG[env];

    if (!accountId) throw new Error('Account data is required');
    if (!envConfig) throw new Error('Invalid environment. Use "test" or "preprod"');

    const phone = (accountPhoneCode + accountPhoneNumber).toString().replace('+', '');

    const unmData = {
      oldEmail: accountUsername,
      email: '',
      isEmailVerified: false,
      isPhoneVerified: true,
      oldPhoneNumber: phone,
      phoneNumber: phone,
      unmUserId,
    };

    onLog.info('Deleting email from UNM...');
    await httpClient.patch(envConfig.unmUrl, unmData, {
      headers: { ...envConfig.unmHeaders, 'Content-Type': 'application/json' },
    });
    onLog.success('Email deleted from UNM');

    onLog.info('Waiting 10 seconds for propagation...');
    await sleep(10000);

    onLog.info('Deleting email from member core...');
    await httpClient.post(`${envConfig.deleteEmailUrl}?accountId=${accountId}`, null, {
      headers: commonHeaders,
    });
    onLog.success('Email deleted from member core');
    onLog.success('Email deletion completed successfully');

    return {
      message: 'Email deleted successfully',
      results: [{ accountId, email: accountUsername, status: 'DELETED' }],
    };
  },
};
