









require('dotenv').config({ path: path.resolve(__dirname, '../.env') });require('dotenv').config({ path: path.resolve(__dirname, '../.env') });



// --- CONFIGURATION ---// --- CONFIGURATION ---









if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {

  console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');

  process.exit(1);

}if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {// --- CONFIGURATION ---











// --- CLI FLAGS ---}









// --- AUTH HEADER ---



  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),



  'Content-Type': 'application/json'





// --- UTILITY FUNCTIONS ---// --- CLI FLAGS ---

function logToFile(message) {



  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);









    method: 'GET',

    headers

  });// --- AUTH HEADER ---    console.error('Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env file');    process.exit(1);





}

  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),    process.exit(1);}

async function getAvailableTransitions(issueKey) {



    method: 'GET',



  });



  return data.transitions || [];





async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {// --- UTILITY FUNCTIONS ---

  if (isDryRun) {



    console.log(msg);



    return;





  try {}



      method: 'POST',// --- CLI FLAGS ---

      headers,

      body: JSON.stringify({ transition: { id: transitionId } })async function getIssueStatus(issueKey) {

    });



    if (!res.ok) throw new Error(`Status ${res.status}`);

    method: 'GET',





    logToFile(msg);

  } catch (err) {  });

    if (retries < MAX_RETRIES) {



      console.warn(msg);

      logToFile(msg);  return data.fields?.status?.name;

      await performTransition(issueKey, transitionId, targetStatus, retries + 1);





      console.error(msg);

      logToFile(msg);

    }async function getAvailableTransitions(issueKey) {// --- AUTH HEADER ---

  }



















    logToFile(msg);

    return;  return data.transitions || [];  'Authorization': 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),  'Accept': 'application/json',

  }

}

  if (currentIndex > targetIndex) {



    console.log(msg);

    logToFile(msg);async function performTransition(issueKey, transitionId, targetStatus, retries = 0) {

    return;

  }  if (isDryRun) {  'Content-Type': 'application/json'};











    logToFile(msg);

    if (!transition) {



      console.error(msg);

      logToFile(msg);  }

      return;

    }// --- UTILITY FUNCTIONS ---function logToFile(message) {



    await performTransition(issueKey, transition.id, nextStatus);  try {

  }





function processCSV(filePath) {      method: 'POST',





  fs.createReadStream(filePath)

    .pipe(csv())      body: JSON.stringify({ transition: { id: transitionId } })

    .on('data', data => results.push(data))

    .on('end', async () => {    });  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);}







        if (!currentStatus) {    if (!res.ok) throw new Error(`Status ${res.status}`);}



          console.error(msg);

          logToFile(msg);



        }

    console.log(msg);

        if (currentStatus === targetTransitionName) {



          console.log(msg);

          logToFile(msg);  } catch (err) {

          continue;







      }

      console.warn(msg);    method: 'GET',    headers

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);

    });      logToFile(msg);

}

      await performTransition(issueKey, transitionId, targetStatus, retries + 1);    headers  });

// --- MAIN ---

if (!csvPath) {    } else {

  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');



}

      console.error(msg);

processCSV(csvPath);


    }

  }  return data.fields?.status?.name;}

}

}

async function smartTransition(issueKey, currentStatus, targetStatus) {







  if (currentIndex === -1 || targetIndex === -1) {



    console.error(msg);

    logToFile(msg);    method: 'GET',    headers

    return;

  }    headers  });









    logToFile(msg);

    return;  return data.transitions || [];}

  }

}

  for (let i = currentIndex + 1; i <= targetIndex; i++) {















      logToFile(msg);

      return;    console.log(msg);    logToFile(msg);

    }

    logToFile(msg);    return;

    await performTransition(issueKey, transition.id, nextStatus);

  }    return;  }

}

  }

function processCSV(filePath) {







    .pipe(csv())



    .on('end', async () => {





      headers,      body: JSON.stringify({ transition: { id: transitionId } })

        if (!currentStatus) {



          console.error(msg);

          logToFile(msg);    });

          continue;

        }    if (!res.ok) throw new Error(`Status ${res.status}`);



        if (currentStatus === targetTransitionName) {    if (!res.ok) throw new Error(`Status ${res.status}`);





          logToFile(msg);



        }

    console.log(msg);    logToFile(msg);

        await smartTransition(issueKey, currentStatus, targetTransitionName);

      }    logToFile(msg);  } catch (err) {



      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);  } catch (err) {    if (retries < MAX_RETRIES) {

    });







if (!csvPath) {

  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');      console.warn(msg);      logToFile(msg);

  process.exit(1);

}      logToFile(msg);      await performTransition(issueKey, transitionId, targetStatus, retries + 1);



processCSV(csvPath);      await performTransition(issueKey, transitionId, targetStatus, retries + 1);    } else {





      console.error(msg);      logToFile(msg);

      logToFile(msg);    }

    }  }

  }}

}

async function smartTransition(issueKey, currentStatus, targetStatus) {







  if (currentIndex === -1 || targetIndex === -1) {





    console.error(msg);    logToFile(msg);

    logToFile(msg);    return;

    return;  }

  }

  if (currentIndex > targetIndex) {





    console.log(msg);    logToFile(msg);

    logToFile(msg);    return;

    return;  }

  }

  for (let i = currentIndex + 1; i <= targetIndex; i++) {









    if (!transition) {





      console.error(msg);      logToFile(msg);

      logToFile(msg);      return;

      return;    }

    }

    await performTransition(issueKey, transition.id, nextStatus);

    await performTransition(issueKey, transition.id, nextStatus);  }

  }}

}

function processCSV(filePath) {





  fs.createReadStream(filePath)

  fs.createReadStream(filePath)    .pipe(csv())

    .pipe(csv())    .on('data', data => results.push(data))

    .on('data', data => results.push(data))    .on('end', async () => {







        if (!currentStatus) {





          console.error(msg);          logToFile(msg);

          logToFile(msg);          continue;

          continue;        }

        }

        if (currentStatus === targetTransitionName) {





          console.log(msg);          logToFile(msg);

          logToFile(msg);          continue;

          continue;        }

        }

        await smartTransition(issueKey, currentStatus, targetTransitionName);

        await smartTransition(issueKey, currentStatus, targetTransitionName);      }

      }

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);

      console.log(`\n📄 Done. Full log written to: ${LOG_FILE}`);    });

    });}

}

// --- MAIN ---

// --- MAIN ---if (!csvPath) {

if (!csvPath) {  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');

  console.error('Usage: node jiraSmartTransition.js <csv-file-path> [--dry-run]');  process.exit(1);

  process.exit(1);}

}

processCSV(csvPath);

processCSV(csvPath);