const sleep = require('../../lib/sleep');
const toCurl = require('../../lib/curl');

const ENV_CONFIG = {
  preprod: {
    otpUrl: 'https://sandbox.eph.bliblitiket.tools/gks-unm-go-be/api/v1/otp/generate',
    verifyUrl: 'https://sandbox.eph.bliblitiket.tools/gks-unm-go-be/api/v1/otp/verify',
    registerUrl: 'https://sandbox.eph.bliblitiket.tools/gks-unm-go-be/api/v1/registration/submit',
    accountIdUrl: 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/account/account-id',
    refUrl: 'https://sandbox.tiket.com/',
    trueClientIp: '34.124.173.71',
  },
  gk: {
    otpUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/generate',
    verifyUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/verify',
    registerUrl: 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/registration/submit',
    accountIdUrl: 'http://member-core-v2.eiffel-ns.svc.tiket/tix-member-core/v2/account/account-id',
    refUrl: 'https://gatotkaca.tiket.com/',
    trueClientIp: '34.87.5.234',
  },
};

async function loggedFetch(label, url, options, onLog) {
  onLog.debug({ message: label, url });
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    onLog.debug({ type: `${label.replace(/\s+/g, '_').toUpperCase()}_RESPONSE`, data });
    return { res, data };
  } catch (err) {
    onLog.error(`${label} request failed: ${err.message}\nCurl:\n${toCurl(url, options)}`);
    throw err;
  }
}

async function generateOtp(recipient, config, onLog) {
  const url = config.otpUrl;
  const options = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'X-Channel-Id': 'WEB',
      'X-Request-Id': 'automation-register',
      'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
      'X-Lang': 'id',
      'Content-Type': 'application/json',
      'True-Client-Ip': config.trueClientIp,
    },
    body: JSON.stringify({
      action: 'REGISTER_OTP',
      channel: 'WHATS_APP',
      recaptchaToken: '',
      recipient,
    }),
  };

  const { data } = await loggedFetch(`Generating OTP for ${recipient}`, url, options, onLog);
  if (!data?.data?.otpId) {
    onLog.error(`OTP generation failed. Curl:\n${toCurl(url, options)}`);
  }
  return data?.data?.otpId || null;
}

async function verifyOtp(otpId, otpCode, config, onLog) {
  const url = config.verifyUrl;
  const options = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'id',
      'X-Channel-Id': 'WEB',
      'X-Request-Id': 'automation-register',
      'X-Client-Id': 'TIKET',
      'Content-Type': 'application/json',
      'True-Client-Ip': config.trueClientIp,
    },
    body: JSON.stringify({ action: 'REGISTER_OTP', otpCode, otpId }),
  };

  const { data } = await loggedFetch(`Verifying OTP ${otpId}`, url, options, onLog);
  if (!data?.data?.passCode) {
    onLog.error(`OTP verification failed. Curl:\n${toCurl(url, options)}`);
  }
  return data?.data?.passCode || null;
}

async function submitRegistration(passCode, email, name, password, phoneCountryCode, phoneNationalNumber, config, onLog) {
  const url = config.registerUrl;
  const options = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
      'True-Client-Ip': config.trueClientIp,
    },
    body: JSON.stringify({
      email, name, passCode, password,
      phoneCountryCode, phoneNationalNumber,
      refUrl: config.refUrl,
      type: 'FORM',
    }),
  };

  const { res, data } = await loggedFetch(`Submitting registration for ${email}`, url, options, onLog);
  if (res.status >= 400 || data?.status === 'ERROR') {
    onLog.error(`Registration failed. Curl:\n${toCurl(url, options)}`);
    return null;
  }
  return data;
}

async function fetchAccountId(email, config, onLog) {
  await sleep(2000);
  const url = `${config.accountIdUrl}?by=EMAIL&memberType=B2C&value=${encodeURIComponent(email)}`;
  const options = {
    headers: {
      Accept: '*/*',
      'Accept-Language': 'id',
      'X-Channel-Id': 'DESKTOP',
      'X-Request-Id': 'automation-fetch',
      'X-Service-Id': 'gateway',
      'X-Store-Id': 'TIKETCOM',
      'X-Username': 'GUEST',
    },
  };

  const { data } = await loggedFetch(`Fetching Account ID for ${email}`, url, options, onLog);
  if (!data?.data?.accountId) {
    onLog.error(`Fetching Account ID failed. Curl:\n${toCurl(url, options)}`);
  }
  return data?.data?.accountId || null;
}

module.exports = async function batchRegister({ rows, options, onLog, signal }) {
  const env = options.env || 'preprod';
  const config = ENV_CONFIG[env];
  if (!config) {
    onLog.error(`Unknown environment: ${env}`);
    return { results: [] };
  }

  onLog.info(`Environment: ${env === 'gk' ? 'GK (Gatotkaca)' : 'Preprod (Sandbox)'}`);
  onLog.info(`Loaded ${rows.length} users from CSV`);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) {
      onLog.warn(`Process stopped by user at row ${i + 1}/${rows.length}`);
      break;
    }

    const user = rows[i];
    try {
      onLog.info(`[${i + 1}/${rows.length}] Processing: ${user.Email}`);
      const recipient = `+${user.phoneCode}${user.phoneNumber}`;
      const otpId = await generateOtp(recipient, config, onLog);
      if (!otpId) {
        onLog.warn(`OTP generation failed for ${user.Email}`);
        results.push({ ...user, status: 'OTP_FAILED' });
        continue;
      }
      onLog.success(`OTP generated for ${user.Email}`);

      if (signal?.aborted) {
        onLog.warn(`Process stopped by user at row ${i + 1}/${rows.length}`);
        results.push({ ...user, status: 'STOPPED' });
        break;
      }

      const passCode = await verifyOtp(otpId, '123456', config, onLog);
      if (!passCode) {
        onLog.warn(`OTP verification failed for ${user.Email}`);
        results.push({ ...user, status: 'VERIFY_FAILED' });
        continue;
      }
      onLog.success(`OTP verified for ${user.Email}`);

      if (signal?.aborted) {
        onLog.warn(`Process stopped by user at row ${i + 1}/${rows.length}`);
        results.push({ ...user, status: 'STOPPED' });
        break;
      }

      const regResult = await submitRegistration(passCode, user.Email, user.Name, 'Testing123', user.phoneCode, user.phoneNumber, config, onLog);
      if (!regResult) {
        onLog.warn(`Registration failed for ${user.Email}`);
        results.push({ ...user, status: 'REGISTRATION_FAILED' });
        continue;
      }
      onLog.success(`Registration submitted for ${user.Email}`);

      const accountId = await fetchAccountId(user.Email, config, onLog);
      onLog.success(`Account ID for ${user.Email}: ${accountId}`);

      results.push({ ...user, accountId, status: 'SUCCESS' });
    } catch (err) {
      onLog.error(`Error processing ${user.Email}: ${err.message}`);
      results.push({ ...user, status: 'ERROR', error: err.message });
    }
  }

  const succeeded = results.filter(r => r.status === 'SUCCESS').length;
  const stopped = signal?.aborted;
  onLog.success(`Batch registration ${stopped ? 'stopped' : 'complete'}. ${succeeded}/${rows.length} succeeded`);
  return { results };
};
