const fs = require('fs');
const csv = require('csv-parser');

async function generateOtpResetPassword(accountId, recipient) {
    console.log(`Generating OTP for:  ${recipient}`)
    const url = 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v3/otp/generate/FORGOT_PASSWORD?channel=SMS'
    recipient = '+' + recipient;
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'id',
        'X-Channel-Id': 'DESKTOP',
        'X-Request-Id': 'automation-yanuar-register',
        'X-Lang': 'id',
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
        'X-Service-Id': 'gateway',
        'X-Store-Id': 'TIKET',
        'X-username': recipient
    }

    const body = JSON.stringify({ recipient });

    // Generate the curl command
    const curlCommand = `curl -X POST "${url}" \\\n` + 
        Object.entries(headers).map(([key, value]) => `  -H "${key}: ${value}" \\`).join('\n') + 
        `\n  -d '${body}'`;

    console.log("curl generate otp:\n", curlCommand);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            throw new Error(`Failed to generate OTP. Status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Success generate OTP with message: ", data.code);

        if (!data.data || !data.data.trxId) {
            throw new Error("trxId not found in response");
        }
        return data.data.trxId;
    } catch(error) {
        console.log("Error: ", error)
        return null;
    }
}

async function resetPassword(trxId, accountId, password) {
    if (!trxId) {
        console.error(`Skipping password reset for ${accountId} due to missing trxId.`);
        return;
    }

    console.log(`Reset password for: ${accountId}`);
    const url = 'https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/password/reset'

    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'id',
        'X-Channel-Id': 'DESKTOP',
        'X-Request-Id': 'automation-yanuar-register',
        'X-Lang': 'id',
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
        'X-Service-Id': 'gateway',
        'X-Store-Id': 'TIKET',
        'X-username': 'GUEST'
    }

    const body = JSON.stringify({
        otpToken: 1234,
        otpTrxId: trxId,
        password: password
    })

    const curlCommand = `curl -X PUT "${url}" \\\n` + 
    Object.entries(headers).map(([key, value]) => `  -H "${key}: ${value}" \\`).join('\n') + 
    `\n  -d '${body}'`;

    console.log("curl reset password:\n", curlCommand);

    const response = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: body
    })

    if (!response.ok) {
        throw new Error(`Failed to reset password. Status: ${response.status}`);
    }

    try {
        const data = await response.json();
        if(data.code != 'SUCCESS') {
            throw new Error(`Failed resetting password with code: ${data.code}`)
        }

        console.log("Response: ", data)
        return data;
    } catch(error) {
        console.log("error: ", error)
    }
}

async function batchResetPassword(filePath) {
    console.log(`Reading user data from CSV: ${filePath}`);
    const users = [];

    fs.createReadStream(filePath).pipe(csv())
    .on('data', (row) => {
        console.log(`Read user: ${JSON.stringify(row)}`);
            users.push(row);
    })
    .on('end', async () => {
        console.log(`Finished reading CSV. Processing ${users.length} users.`);
        for(const user of users) {
            try {
                const phoneNumber = user.phoneCode + user.phoneNumber;
                const trxId = await generateOtpResetPassword(user.accountId, phoneNumber)

                await resetPassword(trxId, user.accountId, user.password)
                console.log("Success reset password ", user.accountId)
            } catch(error) {
                console.error(`Error processing user ${user.Email}:`, error);
            }
        }
    })
}

batchResetPassword('setPassword.csv');