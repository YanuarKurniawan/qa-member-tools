const sleep = require('../../lib/sleep');

const ENV_CONFIG = {
  gk: {
    otpUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/generate',
    verifyUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/verify',
    registerUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/registration/submit',
    accountIdUrl: 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
    refUrl: 'https://gatotkaca.tiket.com/',
  },
};

async function generateOtp(recipient, config) {
  const res = await fetch(config.otpUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'X-Channel-Id': 'WEB',
      'X-Request-Id': 'automation-register',
      'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
      'X-Lang': 'id',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'REGISTER_OTP',
      channel: 'WHATS_APP',
      recaptchaToken: '',
      recipient,
    }),
  });
  const data = await res.json();
  return data?.data?.otpId || null;
}

async function verifyOtp(otpId, otpCode, config) {
  const res = await fetch(config.verifyUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'X-Channel-Id': 'WEB',
      'X-Request-Id': 'automation-register',
      'X-Client-Id': 'TIKET',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'REGISTER_OTP', otpCode, otpId }),
  });
  const data = await res.json();
  return data?.data?.passCode || null;
}

async function submitRegistration(passCode, email, name, password, phoneCountryCode, phoneNationalNumber, config) {
  const res = await fetch(config.registerUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
    },
    body: JSON.stringify({
      email, name, passCode, password,
      phoneCountryCode, phoneNationalNumber,
      refUrl: config.refUrl,
      type: 'FORM',
    }),
  });
  return res.json();
}

async function fetchAccountId(email, config) {
  await sleep(2000);
  const url = `${config.accountIdUrl}?by=EMAIL&memberType=B2C&value=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: {
      Accept: '*/*',
      'Accept-Language': 'id',
      'X-Channel-Id': 'DESKTOP',
      'X-Request-Id': 'automation-fetch',
      'X-Service-Id': 'gateway',
      'X-Store-Id': 'TIKETCOM',
      'X-Username': 'GUEST',
    },
  });
  const data = await res.json();
  return data?.data?.accountId || null;
}

module.exports = async function batchRegisterGk({ rows, options, onLog }) {
  const config = ENV_CONFIG.gk;
  onLog.info(`Loaded ${rows.length} users from CSV`);
  const results = [];

  for (const user of rows) {
    try {
      onLog.info(`Processing: ${user.Email}`);
      const recipient = `+${user.phoneCode}${user.phoneNumber}`;
      const otpId = await generateOtp(recipient, config);
      if (!otpId) {
        onLog.warn(`OTP generation failed for ${user.Email}`);
        results.push({ ...user, status: 'OTP_FAILED' });
        continue;
      }
      onLog.success(`OTP generated for ${user.Email}`);

      const passCode = await verifyOtp(otpId, '123456', config);
      if (!passCode) {
        onLog.warn(`OTP verification failed for ${user.Email}`);
        results.push({ ...user, status: 'VERIFY_FAILED' });
        continue;
      }
      onLog.success(`OTP verified for ${user.Email}`);

      await submitRegistration(passCode, user.Email, user.Name, 'Testing123', user.phoneCode, user.phoneNumber, config);
      onLog.success(`Registration submitted for ${user.Email}`);

      const accountId = await fetchAccountId(user.Email, config);
      onLog.success(`Account ID for ${user.Email}: ${accountId}`);

      results.push({ ...user, accountId, status: 'SUCCESS' });
    } catch (err) {
      onLog.error(`Error processing ${user.Email}: ${err.message}`);
      results.push({ ...user, status: 'ERROR', error: err.message });
    }
  }

  onLog.success(`Batch registration complete. ${results.filter(r => r.status === 'SUCCESS').length}/${rows.length} succeeded`);
  return { results };
};
