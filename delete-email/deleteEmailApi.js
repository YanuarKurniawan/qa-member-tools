const axios = require('axios');

const headers = {
    'Content-Type': 'application/json',
    'accept': '*/*',
    'Accept-Language': 'id',
    'X-Channel-Id': 'DESKTOP',
    'X-Request-Id': 'Yanuar-Test',
    'X-Service-Id': 'gateway',
    'X-Store-Id': 'TIKETCOM'
}

async function deleteEmailApi(accountId) {
    const url = `https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/backfill/set-null-email?accountId=${accountId}`;
    try {
        console.log('Calling API to delete email from Tiket');
        const response = await axios.post(url, null, { headers });
        console.log('Success with Response:\n', response.data);
    } catch (err) {
        console.error('Error calling API:', err.response ? err.response.data : err.message);
        throw new Error('Failed to delete email using API');
    }
}

module.exports = deleteEmailApi;