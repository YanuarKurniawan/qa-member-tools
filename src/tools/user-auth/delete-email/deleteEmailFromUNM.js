const axios = require('axios');

// API details
const url = 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/tools/update-user-identity';
const headers = {
  'X-Challenge': '1771386034218-b0e8875c87de403ab53d8c11bcf16fe2',
  'X-Challenge-Signature': '5cd56a7563ba4cc755c814b034993a0cace3fc216ba472c4b6765ae9f7eb020ed693d4d97204e252001ce3a9d14254716f7c48a44459bbf2a695726f783d680f',
  'X-Username': 'yhose.widtantio@tiket.com',
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
