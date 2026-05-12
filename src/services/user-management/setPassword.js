const sleep = require('../../lib/sleep');

module.exports = async function setPassword({ rows, options, onLog }) {
  onLog.info(`Loaded ${rows.length} users from CSV`);
  const results = [];

  for (const user of rows) {
    try {
      const phoneNumber = user.phoneCode + user.phoneNumber;
      onLog.info(`Resetting password for account ${user.accountId}`);

      const otpRes = await fetch(
        'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v3/otp/generate/FORGOT_PASSWORD?channel=SMS',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Channel-Id': 'DESKTOP',
            'X-Request-Id': 'automation-reset',
            'X-Account-Id': user.accountId,
            'X-Service-Id': 'gateway',
            'X-Store-Id': 'TIKET',
            'X-username': '+' + phoneNumber,
          },
          body: JSON.stringify({ recipient: '+' + phoneNumber }),
        }
      );
      const otpData = await otpRes.json();
      const trxId = otpData?.data?.trxId;

      if (!trxId) {
        onLog.warn(`OTP generation failed for account ${user.accountId}`);
        results.push({ ...user, status: 'OTP_FAILED' });
        continue;
      }
      onLog.success(`OTP generated for account ${user.accountId}`);

      const resetRes = await fetch(
        'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/password/reset',
        {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Channel-Id': 'DESKTOP',
            'X-Account-Id': user.accountId,
            'X-Service-Id': 'gateway',
            'X-Store-Id': 'TIKET',
            'X-username': 'GUEST',
          },
          body: JSON.stringify({
            otpToken: 1234,
            otpTrxId: trxId,
            password: user.password,
          }),
        }
      );
      const resetData = await resetRes.json();

      if (resetData.code !== 'SUCCESS') {
        onLog.warn(`Password reset failed for ${user.accountId}: ${resetData.code}`);
        results.push({ ...user, status: 'RESET_FAILED' });
      } else {
        onLog.success(`Password reset for account ${user.accountId}`);
        results.push({ ...user, status: 'SUCCESS' });
      }
    } catch (err) {
      onLog.error(`Error for account ${user.accountId}: ${err.message}`);
      results.push({ ...user, status: 'ERROR', error: err.message });
    }
  }

  return { results };
};
