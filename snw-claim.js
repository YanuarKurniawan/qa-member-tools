import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

// Load CSV data into memory
const csvData = new SharedArray('CSV data', function () {
  return Papa.parse(open('./data.csv'), { header: true }).data;
});

export let options = {
  vus: 5,            // number of virtual users (concurrent)
  iterations: 300,     // total number of iterations
};

export default function () {
  const index = __ITER; // gives the current iteration index (0-299)
  const accountId = csvData[index % csvData.length].accountId;

  const url = `https://member-core-v2-be-svc.test-platform-cluster.tiket.com/tix-member-core/v3/share`;
  const body = JSON.stringify({
    campaignCode: "topshare",
    shareCode: "xxxxx"
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': `id`,
      'X-Account-Id': accountId,
      'X-Request-Id': `req-snw-no-${index}`,
      'X-Channel-Id': `DESKTOP`,
      'X-Service-Id': `gateway`,
      'X-Store-Id': `TIKETCOM`,
      'X-Username': `testuser-${index}`
    }
  };
  const res = http.post(url, body, params);
    // Log the response status and code for debugging
  console.log(`Iteration ${index + 1}: Fetched data for accountId ${accountId} with status ${res.status} and response code ${res.body.code}`);
  console.log(`Response body: ${res.body}`);
//   check(res, {
//     'status is 200': (r) => r.status === 200,
//   });
}