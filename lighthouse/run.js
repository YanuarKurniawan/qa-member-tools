const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');

async function runLighthouse(url, output) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = { logLevel: 'info', output: 'json', port: chrome.port };
  const runnerResult = await lighthouse(url, options);

  fs.writeFileSync(output, JSON.stringify(runnerResult.lhr, null, 2));
  await chrome.kill();
}

(async () => {
  await Promise.all([
    runLighthouse('https://www.tiket.com/myaccount/passengers/detail', 'report1.json'),
    runLighthouse('https://www.tiket.com/myaccount/passengers/detail', 'report2.json'),
    runLighthouse('https://www.tiket.com/myaccount/passengers/detail', 'report3.json')
  ]);
})();