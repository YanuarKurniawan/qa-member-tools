const axios = require('axios');

const url = 'https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account';
const headers = {
    'Content-Type': 'application/json',
    'accept': '*/*',
    'Accept-Language': 'id',
    'X-Channel-Id': 'DESKTOP',
    'X-Request-Id': 'Yanuar-Test',
    'X-Service-Id': 'gateway',
    'X-Store-Id': 'TIKETCOM'
}

let userData = {};

async function getUserData(email) {
    try {
        console.log('Getting user data by email: ', email);

        const curlCommand = `curl -X GET '${url}' \\\n` +
            Object.entries({
                ...headers,
                "X-Username": email
            })
            .map(([key, value]) => `  -H '${key}: ${value}'`)
            .join(' \\\n');
        // console.log('Equivalent CURL command:\n', curlCommand);

        const response = await axios.get(url ,{
            headers: {
                ...headers,
                "X-Username": email
            }
        });

        if(response.status != 200 || response.data.code != 'SUCCESS') {
            console.log(`got error calling the API:\n ${response.data.code}.\n exiting process.`)
            process.exit();
        }
        if(response.data.data === null) {
            console.log(`${email} is not found on our database. Exiting process!`)
            process.exit();
        }

        const { accountId, accountPhoneCode, accountPhoneNumber, accountUsername, unmUserId } = response.data.data;
        userData = { accountId, accountPhoneCode, accountPhoneNumber, accountUsername, unmUserId };
        console.log('success get data')
    } catch(err) {
        console.error('Error calling API:', err.response ? err.response.data : err.message);
    }
}

module.exports ={
    getUserData,
    getExtractedUserData: () => userData
}