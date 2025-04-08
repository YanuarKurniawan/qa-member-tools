const axios = require('axios');

// API details
const url = 'https://sandbox.eph.bliblitiket.tools/gks-unm-go-be/api/v1/tools/update-user-identity';
const headers = {
  'X-Challenge': '1775625190788-98fedae12c4b40aeb4c1a73881af2fa8',
  'X-Challenge-Signature': 'da881f77adec27b5a045dc01abecf4f0c41258209b4c18c8c68f9fd8ace14118e312601f318aca0db0c18e69cf3e727bce6336d94fb701bfc329fa64ac767906',
  'X-Username': 'titis.akbar@tiket.com',
  'Content-Type': 'application/json',
};

async function deleteEmailFromUNM(data) {
  try {

    const curlCommand = [
      `curl -X PATCH '${url}'`,
      ...Object.entries(headers).map(([key, value]) => `-H '${key}: ${value}'`),
      `-d '${JSON.stringify(data)}'`
    ].join(' \\\n  ');

    console.log('\nEquivalent cURL command:\n');
    console.log(curlCommand + '\n');

    console.log('Calling API to delete email from UNM');
    const response = await axios.patch(url, data, { headers });
    console.log('Success with Response:\n', response.data);
  } catch (err) {
    console.error('Error calling API:', err.response ? err.response.data : err.message);
    throw new Error('Failed to delete email from UNM');
  }
}

module.exports = deleteEmailFromUNM;
