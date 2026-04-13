require('dotenv').config({ path: '../.env' });

const fs = require('fs');
const csv = require('csv-parser');
const { createWriteStream } = require('fs');
const https = require('https');
const path = require('path');

// Configuration
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://jira.yourcompany.com';
const JIRA_USERNAME = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// Input and output files
const inputFile = process.argv[2] || 'run.csv';
const outputFile = process.argv[3] || `testrail-links-${Date.now()}.csv`;

// Regex pattern to extract TestRail link
const TESTRAIL_LINK_PATTERN = /https:\/\/tiket\.testrail\.com\/index\.php\?\/cases\/view\/\d+/gi;

/**
 * Fetch Jira issue details
 */
async function fetchJiraIssue(issueKey) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64');

    const options = {
      hostname: new URL(JIRA_BASE_URL).hostname,
      path: `/rest/api/2/issue/${issueKey}?fields=description`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      }
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).end();
  });
}

/**
 * Extract TestRail link from description
 */
function extractTestRailLink(description, issueKey = '') {
  if (!description) {
    console.log(`  [DEBUG] No description found for ${issueKey}`);
    return '';
  }
  
  // Handle different description formats (ADF content, plain text, etc.)
  let descriptionText = description;
  
  if (typeof description === 'object' && description.content) {
    // If description is in Atlassian Document Format
    console.log(`  [DEBUG] Description is ADF format for ${issueKey}`);
    descriptionText = JSON.stringify(description);
  }
  
  const matches = descriptionText.match(TESTRAIL_LINK_PATTERN);
  if (!matches) {
    console.log(`  [DEBUG] No TestRail link pattern found in ${issueKey}`);
  }
  return matches ? matches[0] : '';
}

/**
 * Process CSV file
 */
async function processCSV() {
  const results = [];
  const issues = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', (row) => {
        issues.push(row);
      })
      .on('end', async () => {
        console.log(`Found ${issues.length} issues to process`);

        // Process each issue
        for (let i = 0; i < issues.length; i++) {
          const issue = issues[i];
          const issueKey = issue.issueKey || issue.jiraId;

          try {
            console.log(`[${i + 1}/${issues.length}] Processing ${issueKey}...`);
            const jiraData = await fetchJiraIssue(issueKey);
            let testRailLink = '';
            if (jiraData && jiraData.fields && jiraData.fields.description) {
              const description = jiraData.fields.description;
              testRailLink = extractTestRailLink(description, issueKey);
            } else {
              console.log(`  [DEBUG] No description found for ${issueKey}`);
            }

            results.push({
              ...issue,
              testRailLink
            });

            console.log(`  Found link: ${testRailLink || 'No TestRail link found'}`);
          } catch (error) {
            console.error(`Error processing ${issueKey}:`, error.message);
            results.push({
              ...issue,
              testRailLink: `ERROR: ${error.message}`
            });
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Write results to CSV
        writeResultsToCSV(results)
          .then(() => {
            console.log(`\nResults written to ${outputFile}`);
            resolve();
          })
          .catch(reject);
      })
      .on('error', reject);
  });
}

/**
 * Write results to CSV file
 */
function writeResultsToCSV(results) {
  return new Promise((resolve, reject) => {
    if (results.length === 0) {
      reject(new Error('No results to write'));
      return;
    }

    // Get all unique column names
    const columns = new Set();
    results.forEach(row => {
      Object.keys(row).forEach(key => columns.add(key));
    });
    const columnArray = Array.from(columns);

    // Create CSV header
    const header = columnArray.join(',') + '\n';

    const stream = createWriteStream(outputFile);
    stream.write(header);

    results.forEach(row => {
      const csvRow = columnArray.map(col => {
        const value = row[col] || '';
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',');
      stream.write(csvRow + '\n');
    });

    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// Main execution
console.log(`Input file: ${inputFile}`);
console.log(`Output file: ${outputFile}`);
console.log('Starting process...\n');

if (!JIRA_USERNAME || !JIRA_API_TOKEN) {
  console.error('Error: JIRA_USERNAME and JIRA_API_TOKEN environment variables must be set');
  process.exit(1);
}

processCSV()
  .then(() => {
    console.log('\nProcess completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
