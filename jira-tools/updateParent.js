









// === CLI Arguments ===









// === Validation ===// === CLI Arguments ===

if (!csvFile) {



  process.exit(1);









// === Jira Configuration ===







if (!csvFile) {

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {



  process.exit(1);

}  process.exit(1);

















  console.log(fullMessage);

  logStream.write(fullMessage + "\n");// === Jira Configuration ===

}



// === Jira Update ===











    method: "PUT",

    headers: {if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

      Authorization: "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),

      "Content-Type": "application/json",  console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");  console.error("❌ Usage: node updateJira.js <file.csv> [--dry-run]");

      Accept: "application/json"

    },  process.exit(1);

    body

  });}  process.exit(1);  process.exit(1);



  return response;

}

// === Logging Setup ===}}

// === Process CSV and do the thing===



  .pipe(csv())



    await new Promise((resolve) => setTimeout(resolve, 500));





function log(message) {require('dotenv').config({ path: path.resolve(__dirname, '../.env') });require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

    if (!issueKey || !parentId) {



      return;







      parent: { key: parentId }

    };  logStream.write(fullMessage + "\n");// === Jira Configuration ===// === Jira Configuration ===



    log(`${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(payload)}`);}





      try {

        let res;// === Jira Update ===

        let attempts = 0;







          res = await updateIssue(issueKey, payload);



          if (res.status === 429) {

            attempts++;





            log(`⏳ Rate limit hit for ${issueKey}. Retrying in ${waitTime / 1000}s (Attempt ${attempts}/${maxAttempts})`);

            await new Promise((resolve) => setTimeout(resolve, waitTime));    method: "PUT",

          } else {

            break;    headers: {if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

          }

        }      Authorization: "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),



        if (res.ok) {      "Content-Type": "application/json",    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');

          log(`✅ ${issueKey} updated successfully`);

        } else {      Accept: "application/json"

          let errorText;

          try {    },    process.exit(1);    process.exit(1);

            errorText = await res.text();

            try {    body



              errorText = JSON.stringify(json);  });}}

            } catch (e) {}

          } catch (e) {

            errorText = `Unable to read error response: ${e.message}`;

          }  return response;

          log(`❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`);

        }}

      } catch (e) {

        log(`❌ Network error for ${issueKey}: ${e.message}`);// === Logging Setup ===// === Logging Setup ===

      }

    }// === Process CSV and do the thing===

  })



    log("✅ CSV processing complete.");

    logStream.end();  .pipe(csv())

  });


    await new Promise((resolve) => setTimeout(resolve, 500));





function log(message) {function log(message) {

    if (!issueKey || !parentId) {



      return;







      parent: { key: parentId }

    };  logStream.write(fullMessage + "\n");  logStream.write(fullMessage + "\n");



    log(`${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(payload)}`);}}



    if (!isDryRun) {

      try {

        let res;// === Jira Update ===// === Jira Update ===

        let attempts = 0;







          res = await updateIssue(issueKey, payload);



          if (res.status === 429) {

            attempts++;





            log(`⏳ Rate limit hit for ${issueKey}. Retrying in ${waitTime / 1000}s (Attempt ${attempts}/${maxAttempts})`);

            await new Promise((resolve) => setTimeout(resolve, waitTime));    method: "PUT",    method: "PUT",

          } else {

            break;    headers: {    headers: {

          }

        }      Authorization:      Authorization:



        if (res.ok) {        "Basic " +        "Basic " +

          log(`✅ ${issueKey} updated successfully`);

        } else {        Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),        Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64"),

          let errorText;

          try {      "Content-Type": "application/json",      "Content-Type": "application/json",

            errorText = await res.text();

            try {      Accept: "application/json",      Accept: "application/json",



              errorText = JSON.stringify(json);    },    },

            } catch (e) {}

          } catch (e) {    body,    body,

            errorText = `Unable to read error response: ${e.message}`;

          }  });  });

          log(`❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`);

        }

      } catch (e) {

        log(`❌ Network error for ${issueKey}: ${e.message}`);  return response;  return response;

      }

    }}}

  })

  .on("end", () => {

    log("✅ CSV processing complete.");

    logStream.end();// === Process CSV and do the thing===// === Process CSV and do the thing===

  });
fs.createReadStream(csvFile)fs.createReadStream(csvFile)

  .pipe(csv())  .pipe(csv())

  .on("data", async (row) => {  .on("data", async (row) => {

    await new Promise((resolve) => setTimeout(resolve, 500));    await new Promise((resolve) => setTimeout(resolve, 500));







    if (!issueKey || !parentId) {

      log(`⚠️ Skipping row — missing IssueKey or parent`);    if (!issueKey || !parentId) {

      return;      log(`⚠️ Skipping row — missing IssueKey or parent`);

    }      return;

    }





    };      parent: { key: parentId },

    };

    log(

      `${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(    // let payload = {};



      )}`    //   .split(",")

    );    //   .map((l) => l.trim())

    //   .filter(Boolean);

    if (!isDryRun) {    // if (labels.length > 0) {

      try {    //   payload.labels = labels;

        let res;    // }

        let attempts = 0;    // if (labelsRaw) {



    //     .split(",")

        while (attempts < maxAttempts) {    //     .map((l) => l.trim())

          res = await updateIssue(issueKey, payload);    //     .filter(Boolean);

    //   if (labels.length > 0) {

          if (res.status === 429) {    //     payload.labels = labels;

            attempts++;    //   }





            log(    log(

              `⏳ Rate limit hit for ${issueKey}. Retrying in ${      `${isDryRun ? "[DRY RUN]" : "[UPDATE]"} ${issueKey} → ${JSON.stringify(

                waitTime / 1000        payload

              }s (Attempt ${attempts}/${maxAttempts})`      )}`

            );    );

            await new Promise((resolve) => setTimeout(resolve, waitTime));

          } else {    if (!isDryRun) {

            break;      try {

          }        let res;

        }        let attempts = 0;



        if (res.ok) {

          log(`✅ ${issueKey} updated successfully`);        while (attempts < maxAttempts) {

        } else {          res = await updateIssue(issueKey, payload);

          let errorText;

          try {          if (res.status === 429) {

            errorText = await res.text();            attempts++;





              errorText = JSON.stringify(json);            log(

            } catch (e) {}              `⏳ Rate limit hit for ${issueKey}. Retrying in ${

          } catch (e) {                waitTime / 1000

            errorText = `Unable to read error response: ${e.message}`;              }s (Attempt ${attempts}/${maxAttempts})`

          }            );

          log(            await new Promise((resolve) => setTimeout(resolve, waitTime));

            `❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`          } else {

          );            break;

        }          }

      } catch (e) {        }

        log(`❌ Network error for ${issueKey}: ${e.message}`);

      }        if (res.ok) {

    }          log(`✅ ${issueKey} updated successfully`);

  })        } else {

  .on("end", () => {          let errorText;

    log("✅ CSV processing complete.");          try {

    logStream.end();            errorText = await res.text();

  });            try {

              errorText = JSON.stringify(json);
            } catch (e) {}
          } catch (e) {
            errorText = `Unable to read error response: ${e.message}`;
          }
          log(
            `❌ Failed to update ${issueKey}: HTTP ${res.status} — ${errorText}`
          );
        }
      } catch (e) {
        log(`❌ Network error for ${issueKey}: ${e.message}`);
      }
    }
  })
  .on("end", () => {
    log("✅ CSV processing complete.");
    logStream.end();
  });
