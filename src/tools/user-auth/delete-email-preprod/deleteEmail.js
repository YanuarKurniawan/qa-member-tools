const deleteEmailFromUNM = require('./deleteEmailFromUNM');
const deleteEmailApi = require('./deleteEmailApi');
const { getUserData, getExtractedUserData } = require('./getUserData');
const readline = require('readline');

// Main function with modifiers
async function main() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  const EMAIL_TARGET = await askQuestion("Enter email to delete: ");
  await wait(2000);
  await getUserData(EMAIL_TARGET);
  const dataUser = getExtractedUserData();
  console.log(dataUser);
  let answer = await askQuestion(`Sure want to delete the data? (Y/N): `);
  
  while (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'n') {
    answer = await askQuestion('Please answer it Y/N: ');
  }

  if(answer.trim().toLowerCase() === 'n') {
    console.log('Process terminated.')
    rl.close();
    process.exit();
  }

  let phone = (dataUser.accountPhoneCode + dataUser.accountPhoneNumber).toString().replace('+', '');
  const accountId = dataUser.accountId;
  const unmUserId = dataUser.unmUserId;
  const oldEmail = dataUser.accountUsername;
  const email = '';
  const isEmailVerified = false;
  const isPhoneVerified = true;
  let oldPhoneNumber = phone;
  let phoneNumber = phone;

  const unmData = {
    oldEmail,
    email,
    isEmailVerified,
    isPhoneVerified,
    oldPhoneNumber,
    phoneNumber,
    unmUserId,
  };

  try {

    await deleteEmailFromUNM(unmData);

    const waitTime = 10000;
    const startTime = new Date();

    console.log(`Waiting for ${waitTime / 1000} seconds... Start time: ${startTime.toISOString()} \n`);
    await wait(waitTime);
    await deleteEmailApi(accountId);
    console.log('Operations completed successfully!');
    rl.close();
  } catch (err) {
    console.error('Error during operations:', err.message);
    process.exit();
  }
}

// Run the main function
main();
