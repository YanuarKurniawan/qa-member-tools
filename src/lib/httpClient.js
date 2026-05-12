const axios = require('axios');
const https = require('https');

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const httpClient = axios.create({
  timeout: 30000,
  httpsAgent: insecureAgent,
});

httpClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.response?.data?.code || err.message;
    const enhanced = new Error(msg);
    enhanced.status = err.response?.status;
    enhanced.data = err.response?.data;
    throw enhanced;
  }
);

module.exports = httpClient;
