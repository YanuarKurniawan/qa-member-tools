process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const fs = require("fs");
const csv = require("csv-parser");
const { stringify } = require("csv-stringify/sync");
const readline = require("readline");

const ENV_CONFIG = {
  test: {
    accountIdUrl:
      "https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id",
  },
  preprod: {
    accountIdUrl:
      "https://member-core-v2-be-svc.preprod-platform-cluster.tiket.com/tix-member-core/v2/account/account-id",
  },
  prod: {
    accountIdUrl:
      "https://member-core-v2-be-svc.platform-cluster.tiket.com/tix-member-core/v2/account/account-id",
  },
};

const commonHeaders = {
  'accept': '*/*',
  'X-Store-Id': 'TIKETCOM',
  'X-Channel-Id': 'WEB',
  'X-Service-Id': 'gateway',
  'X-Request-Id': '8599a603-bf86-4222-a2e7-9c1df4a25bbe',
  'X-Username': 'username',
  'X-Account-Id': '0',
  'Accept-Language': 'id',
  'Content-Type': 'application/json',
};

async function fetchAccountId(email, env = 'test', memberType = 'B2C') {
  const config = ENV_CONFIG[env];
  if (!config) {
    throw new Error(`Invalid environment: ${env}. Use 'test' or 'preprod'`);
  }

  const url = `${config.accountIdUrl}?memberType=${memberType}&by=EMAIL&value=${encodeURIComponent(email)}`;

  try {
    console.log(`Fetching account ID for: ${email}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: commonHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    const accountId = data?.data?.accountId;

    if (accountId) {
      console.log(`✓ Account ID for ${email}: ${accountId}`);
      return accountId;
    } else {
      console.warn(`✗ No account ID found for ${email}`);
      return '';
    }
  } catch (error) {
    console.error(`Error fetching account ID for ${email}:`, error.message);
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccountIdsFromCSV(filePath, env = 'test', memberType = 'B2C') {
  console.log(`\nReading email data from CSV: ${filePath}`);
  console.log(`Environment: ${env}, Member Type: ${memberType}\n`);

  const emails = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      const email = row.email || row.Email;
      if (email) {
        console.log(`Read email: ${email}`);
        emails.push(row);
      }
    })
    .on("end", async () => {
      console.log(`\nFinished reading CSV. Processing ${emails.length} emails.\n`);

      for (const row of emails) {
        const email = row.email || row.Email;
        try {
          const accountId = await fetchAccountId(email, env, memberType);
          row.accountId = accountId;
          await sleep(500); // Rate limiting
        } catch (error) {
          console.error(`Error processing ${email}:`, error.message);
          row.accountId = '';
        }
      }

      // Write results back to CSV
      const csvOutput = stringify(emails, {
        header: true,
        columns: Object.keys(emails[0] || {}).concat(['accountId']),
      });

      fs.writeFileSync(filePath, csvOutput);
      const successCount = emails.filter(r => r.accountId).length;
      console.log(`\n✓ Completed! ${successCount}/${emails.length} account IDs found.`);
      console.log(`Results saved to: ${filePath}`);
    });
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  try {
    const filePath = await askQuestion("Enter CSV file path: ");
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      rl.close();
      process.exit(1);
    }

    const env = await askQuestion("Enter environment (test/preprod) [default: test]: ");
    const selectedEnv = (env.trim() || 'test').toLowerCase();

    if (!ENV_CONFIG[selectedEnv]) {
      console.error(`Invalid environment: ${selectedEnv}`);
      rl.close();
      process.exit(1);
    }

    const memberType = await askQuestion("Enter member type (B2C/ADMIN) [default: B2C]: ");
    const selectedMemberType = (memberType.trim() || 'B2C').toUpperCase();

    rl.close();

    await getAccountIdsFromCSV(filePath, selectedEnv, selectedMemberType);
  } catch (error) {
    console.error("Error:", error.message);
    rl.close();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { getAccountIdsFromCSV, fetchAccountId };
