import http from "k6/http";
import { SharedArray } from "k6/data";
import Papa from "https://jslib.k6.io/papaparse/5.1.1/index.js";

// Load CSV
const csvData = new SharedArray("CSV Data", function () {
  return Papa.parse(open("./preprod.csv"), {
    header: true,
    skipEmptyLines: true,
  }).data;
});

const totalRows = Number(__ENV.CSV_ROWS || csvData.length);
const offset = Number(__ENV.CSV_OFFSET || 0);

export let options = {
  vus: totalRows,
  iterations: totalRows,
  timeFormat: "ms",
};

export default function () {
  const index = (__VU - 1) + offset; // VU starts from 1, so we subtract 1 to get the correct index
  const accountId = csvData[index].accountId;
  const url = "https://lb1-ms.preprod.tiket.com/tix-member-core/v3/share";
  const payload = JSON.stringify({
    shareCode: "i28788",
    campaignCode: "scale-up",
  });

  const headers = {
    accept: "*/*",
    "X-Store-Id": "TIKETCOM",
    "X-Account-Id": accountId,
    "X-Channel-Id": "WEB",
    "X-Service-Id": "gateway",
    "X-Request-Id": `req-${__VU}-${index}`,
    "X-Username": `testuser-${__VU}-${index}`,
    "Content-Type": "application/json",
    "Accept-Language": "en",
  };

  const res = http.post(url, payload, { headers });
  const body = res.body.replace(/\s+/g, " ").replace(/"/g, '""').slice(0, 200);
  const curlHeaders = Object.entries(headers)
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(" ");
  const curl = `curl -X POST '${url}' ${curlHeaders} -d '${payload}'`.replace(
    /"/g,
    '""'
  );
  const responseTime = res.timings.duration;

  const logLine = JSON.stringify({
    iteration: __VU,
    accountId,
    status: res.status,
    response: res.body.replace(/\s+/g, " ").replace(/"/g, '""'), // Shorten if needed
    curl,
    duration: res.timings.duration,
  });

  console.log(logLine);
}
