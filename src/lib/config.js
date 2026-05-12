const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const optional = (key, fallback = '') => process.env[key] || fallback;

module.exports = {
  PORT: optional('PORT', '3456'),
  API_KEY: optional('API_KEY'),
  CORS_ALLOWED_ORIGINS: optional('CORS_ALLOWED_ORIGINS', 'http://localhost:5173'),

  JIRA_BASE_URL: optional('JIRA_BASE_URL'),
  JIRA_EMAIL: optional('JIRA_EMAIL'),
  JIRA_API_TOKEN: optional('JIRA_API_TOKEN'),

  TESTRAIL_BASE_URL: optional('TESTRAIL_BASE_URL', 'https://tiket.testrail.com'),
  TESTRAIL_USER: optional('TESTRAIL_USER'),
  TESTRAIL_API_KEY: process.env.TESTRAIL_API_KEY || process.env.TESTRAIL_PASS || '',

  UNM_TEST_CHALLENGE: optional('UNM_TEST_CHALLENGE'),
  UNM_TEST_CHALLENGE_SIGNATURE: optional('UNM_TEST_CHALLENGE_SIGNATURE'),
  UNM_TEST_USERNAME: optional('UNM_TEST_USERNAME'),
  UNM_PREPROD_CHALLENGE: optional('UNM_PREPROD_CHALLENGE'),
  UNM_PREPROD_CHALLENGE_SIGNATURE: optional('UNM_PREPROD_CHALLENGE_SIGNATURE'),
  UNM_PREPROD_USERNAME: optional('UNM_PREPROD_USERNAME'),

  DB_HOST: optional('DB_HOST'),
  DB_PORT: optional('DB_PORT', '3306'),
  DB_USER: optional('DB_USER'),
  DB_PASSWORD: optional('DB_PASSWORD'),
  DB_NAME: optional('DB_NAME'),

  ALLOWED_CURL_HOSTS: optional('ALLOWED_CURL_HOSTS').split(',').map(h => h.trim()).filter(Boolean),
};
