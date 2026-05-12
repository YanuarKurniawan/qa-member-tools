const config = require('../../lib/config');

const ENV_CONFIG = {
  test: {
    accountIdUrl: 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
    accountDetailUrl: 'https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/detail',
    roleUrl: 'https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/role',
    privilegeUrl: 'https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/privilege',
  },
  preprod: {
    accountIdUrl: 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
    accountDetailUrl: 'https://member-sidekick-go-be-svc.preprod-platform-cluster.tiket.com/tix-member-role-privilege/v1/account/detail',
    roleUrl: 'https://member-sidekick-go-be-svc.preprod-platform-cluster.tiket.com/tix-member-role-privilege/v1/account/role',
    privilegeUrl: 'https://member-sidekick-go-be-svc.preprod-platform-cluster.tiket.com/tix-member-role-privilege/v1/account/privilege',
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

module.exports = async function copyRolePrivilege({ rows, options, onLog }) {
  const { sourceEmail, targetEmail, env = 'test' } = options;
  const envConfig = ENV_CONFIG[env];

  if (!sourceEmail || !targetEmail) throw new Error('sourceEmail and targetEmail are required');
  if (!envConfig) throw new Error('Invalid environment. Use "test" or "preprod"');

  onLog.info(`Fetching source account ID for: ${sourceEmail}`);
  const sourceRes = await fetch(
    `${envConfig.accountIdUrl}?by=EMAIL&memberType=ADMIN&value=${encodeURIComponent(sourceEmail)}`,
    { headers: commonHeaders }
  );
  const sourceData = await sourceRes.json();
  const sourceAccountId = sourceData?.data?.accountId;
  if (!sourceAccountId) {
    onLog.error(`Source account not found for ${sourceEmail}`);
    throw new Error('Source account not found');
  }
  onLog.success(`Source Account ID: ${sourceAccountId}`);

  onLog.info(`Fetching target account ID for: ${targetEmail}`);
  const targetRes = await fetch(
    `${envConfig.accountIdUrl}?by=EMAIL&memberType=ADMIN&value=${encodeURIComponent(targetEmail)}`,
    { headers: commonHeaders }
  );
  const targetData = await targetRes.json();
  const targetAccountId = targetData?.data?.accountId;
  if (!targetAccountId) {
    onLog.error(`Target account not found for ${targetEmail}`);
    throw new Error('Target account not found');
  }
  onLog.success(`Target Account ID: ${targetAccountId}`);

  onLog.info('Fetching source account details...');
  const detailRes = await fetch(
    `${envConfig.accountDetailUrl}?accountId=${sourceAccountId}`,
    { headers: commonHeaders }
  );
  const details = await detailRes.json();
  const roles = details?.data?.accountRole || [];
  const privileges = details?.data?.accountPrivilege || [];

  onLog.info(`Found ${roles.length} roles and ${privileges.length} privileges`);

  const roleIds = roles.map((r) => r.roleId).join(',');
  const privIds = privileges.map((p) => p.privId).join(',');

  if (roleIds) {
    onLog.info('Assigning roles to target account...');
    const roleRes = await fetch(envConfig.roleUrl, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ accountId: targetAccountId, isBulk: true, roleIds }),
    });
    const roleResult = await roleRes.json();
    if (roleResult.code === 'SUCCESS') {
      onLog.success(`${roles.length} roles assigned successfully`);
    } else {
      onLog.error(`Failed to assign roles: ${roleResult.code}`);
    }
  }

  if (privIds) {
    onLog.info('Assigning privileges to target account...');
    const privRes = await fetch(envConfig.privilegeUrl, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ accountId: targetAccountId, isBulk: true, privIds }),
    });
    const privResult = await privRes.json();
    if (privResult.code === 'SUCCESS') {
      onLog.success(`${privileges.length} privileges assigned successfully`);
    } else {
      onLog.error(`Failed to assign privileges: ${privResult.code}`);
    }
  }

  onLog.success('Copy role & privilege completed');
  return {
    results: [
      {
        sourceEmail,
        targetEmail,
        rolesAssigned: roles.map((r) => r.roleName).join(', '),
        privilegesAssigned: privileges.map((p) => p.privName).join(', '),
        status: 'SUCCESS',
      },
    ],
  };
};
