const axios = require('axios');
require('dotenv').config();

const url = process.env.UNM_TEST_URL || 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/tools/update-user-identity';
const headers = {
  'X-Challenge': process.env.UNM_TEST_CHALLENGE,
  'X-Challenge-Signature': process.env.UNM_TEST_CHALLENGE_SIGNATURE,
  'X-Username': process.env.UNM_TEST_USERNAME,
  'Content-Type': 'application/json',
};

async function deleteEmailFromUNM(data) {
  try {
    console.log('Calling API to delete email from UNM');
    const response = await axios.patch(url, data, { headers });
    console.log('Success with Response:\n', response.data);
  } catch (err) {
    console.error('Error calling API:', err.response ? err.response.data : err.message);
    throw new Error('Failed to delete email from UNM');
  }
}

module.exports = deleteEmailFromUNM;
