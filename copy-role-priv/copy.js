const fetch = require("node-fetch"); // Install with: npm install node-fetch

const headers = {
  "accept": "*/*",
  "Accept-Language": "id",
  "True-Client-Ip": "127.0.0.1",
  "X-Account-Id": "0",
  "X-Business-Id": "0",
  "X-Channel-Id": "DESKTOP",
  "X-Currency": "idr",
  "X-Forwarded-For": "127.0.0.1",
  "X-Identity": "identity",
  "X-Login-Media": "none",
  "X-Request-Id": "aefad992-014b-4598-8a22-07181b2b6e88",
  "X-Reseller-Id": "0",
  "X-Service-Id": "gateway",
  "X-Store-Id": "TIKETCOM",
  "X-Username": "GUEST",
  "Content-Type": "application/json"
};

async function getAccountId(email) {
  const url = `https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v2/account/account-id?by=EMAIL&memberType=ADMIN&value=${email}`;
  try {
    const response = await fetch(url, { method: "GET", headers });
    const data = await response.json();
    return data.data.accountId;
  } catch (error) {
    console.error("Error fetching account ID:", error);
    return null;
  }
}

async function getAccountDetails(accountId) {
  const url = `https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/detail?accountId=${accountId}`;
  try {
    const response = await fetch(url, { method: "GET", headers });
    return await response.json();
  } catch (error) {
    console.error("Error fetching account details:", error);
    return null;
  }
}

async function assignRolesToTargetAccount(targetAccountId, roleIds) {
  const url = "https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/role";
  const payload = JSON.stringify({
    accountId: targetAccountId,
    isBulk: true,
    roleIds: roleIds
  });

  const curl = [
    `curl -X POST "${url}"`,
    ...Object.entries(headers).map(([key, value]) => `-H "${key}: ${value}"`),
    `-d '${payload}'`
  ].join(" \\\n");

  console.log("assignRoles curl:\n", curl);

  try {
    const response = await fetch(url, { method: "POST", headers, body: payload });
    const data = await response.json();
    return data.code;
  } catch (error) {
    console.error("Error assigning roles:", error);
    return null;
  }
}

async function assignPrivilegesToTargetAccount(targetAccountId, privIds) {
  const url = "https://lb1-testing.tiket.com/tix-member-role-privilege/v1/account/privilege";
  const payload = JSON.stringify({
    accountId: targetAccountId,
    isBulk: true,
    privIds: privIds
  });

  const curl = [
    `curl -X POST "${url}"`,
    ...Object.entries(headers).map(([key, value]) => `-H "${key}: ${value}"`),
    `-d '${payload}'`
  ].join(" \\\n");

  console.log("assignPrivs curl:\n", curl);

  try {
    const response = await fetch(url, { method: "POST", headers, body: payload });
    const data = await response.json();
    return data.code;
  } catch (error) {
    console.error("Error assigning privileges:", error);
    return null;
  }
}

async function main(sourceEmail, targetEmail) {
  if (!sourceEmail || !targetEmail) {
    console.error("Usage: node script.js <sourceEmail> <targetEmail>");
    process.exit(1);
  }

  const sourceAccountId = await getAccountId(sourceEmail);
  const targetAccountId = await getAccountId(targetEmail);

  console.log("Source Account ID:", sourceAccountId);
  console.log("Target Account ID:", targetAccountId);

  const accountDetails = await getAccountDetails(sourceAccountId);
  if (!accountDetails) {
    console.error("Failed to get account details.");
    return;
  }

  const sourceAccountRoles = accountDetails.data.accountRole?.map(role => role.roleId).join(",") || "";
  const sourceAccountPrivileges = accountDetails.data.accountPrivilege?.map(priv => priv.privId).join(",") || "";

  console.log("Source Account Roles:", accountDetails.data.accountRole?.map(role => role.roleName).join(", ") || "None");
  console.log("Source Account Privileges:", accountDetails.data.accountPrivilege?.map(priv => priv.privName).join(", ") || "None");

  const roleAssignStatus = await assignRolesToTargetAccount(targetAccountId, sourceAccountRoles);
  console.log(roleAssignStatus === "SUCCESS" ? `Total roles assigned: ${sourceAccountRoles.split(",").length}` : "Failed to assign roles");

  const privilegeAssignStatus = await assignPrivilegesToTargetAccount(targetAccountId, sourceAccountPrivileges);
  console.log(privilegeAssignStatus === "SUCCESS" ? `Total privileges assigned: ${sourceAccountPrivileges.split(",").length}` : "Failed to assign privileges");
}

// Get command line arguments and run the script
const [,, sourceEmail, targetEmail] = process.argv;
main(sourceEmail, targetEmail);
