require('dotenv').config();
const fs = require("fs");
const csv = require("csv-parser");
const { stringify } = require("csv-stringify/sync");

async function updateSectionDescriptions(csvPath) {
    // Configure these as needed or via environment variables
    const projectId = process.env.TESTRAIL_PROJECT_ID || 162;
    const suiteId = process.env.TESTRAIL_SUITE_ID || 4710;
    const baseUrl = process.env.TESTRAIL_BASE_URL || 'https://tiket.testrail.com';
    const user = process.env.TESTRAIL_USER;
    const pass = process.env.TESTRAIL_PASS;

    if (!user || !pass) {
        console.error('Please set TESTRAIL_USER and TESTRAIL_PASS environment variables');
        return;
    }

    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    const results = [];

    // Read and process CSV file
    const rows = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`Found ${rows.length} sections to update`);

    // Process each section
    for (const row of rows) {
        const sectionId = row.id;
        // const description = row.description;
        const name = row.name;

        // console.log(`Updating section ${sectionId} with description: ${description}`);
        console.log(
          `Updating section ${sectionId} with name: ${name}`
        );

        try {
            const response = await fetch(`${baseUrl}/index.php?/api/v2/update_section/${sectionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': auth
                },
                body: JSON.stringify({
                    // description: description
                    name: name
                })
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`Failed to update section ${sectionId}: ${response.status} - ${text}`);
                results.push({
                    id: sectionId,
                    status: 'error',
                    message: `API returned ${response.status}: ${text}`
                });
                continue;
            }

            const data = await response.json();
            console.log(`Successfully updated section ${sectionId}`);
            results.push({
                id: sectionId,
                status: 'success',
                message: 'Updated successfully'
            });

            // Small delay to be polite to the API
            await new Promise(r => setTimeout(r, 300));

        } catch (error) {
            console.error(`Error updating section ${sectionId}:`, error);
            results.push({
                id: sectionId,
                status: 'error',
                message: error.toString()
            });
        }
    }

    // Write results to a log file
    const timestamp = new Date().getTime();
    const logPath = `/Users/yanuarkurniawan/qa-member-tools/qa-member-tools/testrail/update-log-${timestamp}.csv`;
    const csvData = stringify(results, { header: true, columns: ['id', 'status', 'message'] });
    fs.writeFileSync(logPath, csvData);
    console.log(`\nUpdate complete. Results written to ${logPath}`);

    // Summary
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    console.log(`\nSummary:`);
    console.log(`- Total sections processed: ${results.length}`);
    console.log(`- Successfully updated: ${successful}`);
    console.log(`- Failed to update: ${failed}`);
}

// Run when executed directly
const csvPath = process.argv[2];
if (!csvPath) {
    console.error('Please provide the path to the CSV file as an argument');
    console.log('Usage: node updateSection.js path/to/sections.csv');
    process.exit(1);
}

updateSectionDescriptions(csvPath).catch(err => {
    console.error('Unhandled error:', err);
});
