const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const shell = require("shell-quote");

const inputFile = "./okman.csv";
const outputFile = "./outputxx.csv";

// Parse curl string
function parseCurl(curlCommand) {
  curlCommand = curlCommand.replace(/\\\s*\n/g, " ").trim();
  const tokens = shell.parse(curlCommand);

  let url = "";
  let method = "GET";
  let headers = {};
  let data = null;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "-X") {
      method = tokens[i + 1];
    }
    if (tokens[i].startsWith("http")) {
      url = tokens[i];
    }
    if (tokens[i] === "-H") {
      const header = tokens[i + 1];
      const [key, value] = header.split(/:\s*/);
      headers[key] = value;
    }
    if (tokens[i] === "-d" || tokens[i] === "--data") {
      data = tokens[i + 1];
    }
  }

  return { url, method, headers, data };
}

const rows = [];
fs.createReadStream(inputFile)
  .pipe(csv())
  .on("data", (row) => rows.push(row))
  .on("end", async () => {
    console.log(`Processing ${rows.length} rows...\n`);

    for (let row of rows) {
      const curlText = row["Steps"];
      if (!curlText) continue;

      try {
        const { url, method, headers, data } = parseCurl(curlText);

        const response = await fetch(url, {
          method,
          headers,
          body: data,
        });

        row["Status Code"] = response.status;
        const text = await response.text();
        row["Response"] = text.substring(0, 32760); // Excel/CSV-safe
      } catch (err) {
        row["Status Code"] = "ERR";
        row["Response"] = err.message.substring(0, 200);
      }
    }

    const csvWriter = createCsvWriter({
      path: outputFile,
      header: Object.keys(rows[0]).map((key) => ({ id: key, title: key })),
    });

    await csvWriter.writeRecords(rows);
    console.log(`✅ Done! Check output: ${outputFile}`);
  });
