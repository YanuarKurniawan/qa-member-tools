const fs = require('fs');
const csv = require('csv-parser');
const { stringify } = require('csv-stringify/sync');

async function generateOtp(recipient) {
    console.log(`Generating OTP for recipient: ${recipient}`);
    const url = 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/generate';
    
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'id',
        'X-Channel-Id': 'WEB',
        'X-Request-Id': 'automation-yanuar-register',
        'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
        'X-Lang': 'id',
        'Content-Type': 'application/json'
    };
    
    const body = JSON.stringify({
        action: "REGISTER_OTP",
        channel: "WHATS_APP",
        recaptchaToken: "",
        recipient: recipient
    });
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });
        
        const data = await response.json();
        console.log('OTP Generation Response:', data);
        return data.data.otpId;
    } catch (error) {
        console.error('Error generating OTP:', error);
    }
}

async function verifyOtp(otpId, otpCode) {
    console.log(`Verifying OTP with otpId: ${otpId} and otpCode: ${otpCode}`);
    const url = 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/otp/verify';
    
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'id',
        'X-Channel-Id': 'WEB',
        'X-Request-Id': 'automation-yanuar-register',
        'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009',
        'Content-Type': 'application/json'
    };
    
    const body = JSON.stringify({
        action: "REGISTER_OTP",
        otpCode: otpCode,
        otpId: otpId
    });
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });
        
        const data = await response.json();
        console.log('OTP Verification Response:', data);
        return data.data.passCode;
    } catch (error) {
        console.error('Error verifying OTP:', error);
    }
}

async function submitRegistration(passCode, email, name, password, phoneCountryCode, phoneNationalNumber, refUrl) {
    console.log(`Submitting registration for ${email}`);
    const url = 'https://service.bliblitiket.tools/gks-unm-go-be/api/v1/registration/submit';
    
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client-Id': '9dc79e3916a042abc86c2aa525bff009'
    };
    
    const body = JSON.stringify({
        email: email,
        name: name,
        passCode: passCode,
        password: password,
        phoneCountryCode: phoneCountryCode,
        phoneNationalNumber: phoneNationalNumber,
        refUrl: refUrl,
        type: "FORM"
    });
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });
        
        const data = await response.json();
        console.log('Registration Response:', data);
        return data;
    } catch (error) {
        console.error('Error submitting registration:', error);
    }
}

async function fetchAccountId(email) {
    console.log(`Waiting 2 seconds before fetching account ID for email: ${email}`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`Fetching account ID for email: ${email}`);
    const url = `https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id?by=EMAIL&memberType=B2C&value=${encodeURIComponent(email)}`;
    
    const headers = {
        'Accept': '*/*',
        'Accept-Language': 'id',
        'X-Channel-Id': 'DESKTOP',
        'X-Request-Id': '18bf1bb2-9281-43be-897a-5ecf146ff75a',
        'X-Service-Id': 'gateway',
        'X-Store-Id': 'TIKETCOM',
        'X-Username': 'GUEST'
    };
    
    try {
        const response = await fetch(url, { method: 'GET', headers: headers });
        const data = await response.json();
        console.log('Account ID Response:', data);
        return data.data.accountId;
    } catch (error) {
        console.error('Error fetching account ID:', error);
    }
}

async function batchRegisterUsersFromCSV(filePath) {
    console.log(`Reading user data from CSV: ${filePath}`);
    const users = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            console.log(`Read user: ${JSON.stringify(row)}`);
            users.push(row);
        })
        .on('end', async () => {
            console.log(`Finished reading CSV. Processing ${users.length} users.`);
            for (const user of users) {
                try {
                    console.log(`Processing user: ${user.Email}`);
                    const otpId = await generateOtp(`+${user.phoneCode}${user.phoneNumber}`);
                    if (!otpId) {
                        console.log(`Skipping user ${user.Email}, OTP generation failed.`);
                        continue;
                    }
                    
                    const passCode = await verifyOtp(otpId, '123456');
                    if (!passCode) {
                        console.log(`Skipping user ${user.Email}, OTP verification failed.`);
                        continue;
                    }
                    
                    await submitRegistration(
                        passCode,
                        user.Email,
                        user.Name,
                        'Testing123',
                        user.phoneCode,
                        user.phoneNumber,
                        'https://gatotkaca.tiket.com/'
                    );

                    const accountId = await fetchAccountId(user.Email);
                    user.accountId = accountId;
                } catch (error) {
                    console.error(`Error processing user ${user.Email}:`, error);
                }
            }
            const csvOutput = stringify(users, { header: true, columns: ["Name", "Email", "phoneCode", "phoneNumber", "Level", "accountId"] });
            fs.writeFileSync(filePath, csvOutput);
        });
}

// Run batch registration from CSV
batchRegisterUsersFromCSV('regisnw2.csv');
