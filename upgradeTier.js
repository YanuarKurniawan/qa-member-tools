const fs = require('fs');
const csv = require('csv-parser');

async function upgradeTierFromCSV(filePath) {
    console.log(`Reading user data from CSV: ${filePath}`);
    const tierUpgradeSpecifications = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            console.log(`Read user: ${JSON.stringify(row)}`);
            tierUpgradeSpecifications.push({
                accountId: Number(row.accountId),
                targetLevel: row.Level
            });
        })
        .on('end', async () => {
            console.log(`Finished reading CSV. Sending upgrade requests in batches of 5.`);
            for (let i = 0; i < tierUpgradeSpecifications.length; i += 5) {
                const batch = tierUpgradeSpecifications.slice(i, i + 5);
                console.log(`Processing batch ${Math.floor(i / 5) + 1}: ${JSON.stringify(batch)}`);
                await sendUpgradeRequest(batch);
            }
        });
}

async function sendUpgradeRequest(tierUpgradeSpecifications) {
    const url = 'https://loyalty-core-be-svc.preprod-platform-cluster.tiket.com/tix-loyalty-core/user/upgrade-tier';
    const headers = {
        'Accept': '*/*',
        'Accept-Language': 'id',
        'X-Channel-Id': 'DESKTOP',
        'X-Currency': 'idr',
        'X-Request-Id': 'automaton-upgrade',
        'X-Service-Id': 'gateway',
        'X-Store-Id': 'TIKETCOM',
        'X-Username': 'system',
        'Content-Type': 'application/json',
    };
    
    const body = JSON.stringify({
        tierUpgradeSpecifications,
        upgradeType: "SERVICE_UPGRADE"
    }, null, 2);

    console.log('Generated cURL command:');
    console.log(`curl -X POST '${url}' \
  -H 'Accept: */*' \
  -H 'Accept-Language: id' \
  -H 'X-Channel-Id: DESKTOP' \
  -H 'X-Currency: idr' \
  -H 'X-Request-Id: automaton-upgrade' \
  -H 'X-Service-Id: gateway' \
  -H 'X-Store-Id: TIKETCOM' \
  -H 'X-Username: system' \
  -H 'Content-Type: application/json' \
  -d '${body.replace(/'/g, "'\"'\"")}'`);
    
    console.log('Sending upgrade request:', body);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });
        
        const data = await response.json();
        console.log('Upgrade Response:', data);
    } catch (error) {
        console.error('Error sending upgrade request:', error);
    }
}

upgradeTierFromCSV('register.csv');
