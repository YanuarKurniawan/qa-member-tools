require('dotenv').config();
const fs = require("fs");
const csv = require("csv-parser");
const { stringify } = require("csv-stringify/sync");

async function callTestRailGetSectionApi() {
    const parentId = 101306;
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

    // Start at offset 750 where we know there are sections with parent_id 156450
    const limit = 250;
    let offset = 750;
    let allMatches = [];

    while (true) {
        const url = `${baseUrl}/index.php?/api/v2/get_sections/${projectId}&suite_id=${suiteId}&limit=${limit}&offset=${offset}`;
        console.log(`Requesting: ${url} (looking for parent_id: ${parentId})`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': auth
                }
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`TestRail API returned ${response.status}: ${text}`);
                break;
            }

            const data = await response.json();
            const sections = data.sections;
            
            if (!Array.isArray(sections)) {
                console.log('Sections is not an array:', typeof sections);
                break;
            }
            
            if (sections.length === 0) {
                console.log('No more sections returned (empty array), stopping paging.');
                break;
            }

            // Filter sections by parent_id and log matches
            // Debug logging
            console.log('First few items:', sections.slice(0, 3).map(s => ({
                id: s.id,
                name: s.name,
                parent_id: s.parent_id,
                parent_id_type: typeof s.parent_id
            })));
            console.log('Looking for parentId:', parentId, 'type:', typeof parentId);
            
                        // Convert parent_id to number for comparison
            const matches = sections.filter(s => Number(s.parent_id) === parentId);
            console.log(`Found ${matches.length} matches in this batch`);
            allMatches.push(...matches.map(m => ({ id: m.id, name: m.name })));
            // If returned less than limit, we're done
            if (sections.length < limit) break;

            offset += limit;
            // small delay to be polite
            await new Promise(r => setTimeout(r, 300));

        } catch (error) {
            console.error('Error calling TestRail API:', error);
            break;
        }
    }

    if (allMatches.length === 0) {
        console.log(`No sections found with parent_id = ${parentId}`);
    } else {
        const outputPath =
          `/Users/yanuarkurniawan/qa-member-tools/qa-member-tools/testrail/sections_parent_${parentId}.csv`;
        const csvData = stringify(allMatches, { header: true, columns: ['id', 'name'] });
        fs.writeFileSync(outputPath, csvData);
        console.log(`Wrote ${allMatches.length} rows to ${outputPath}`);
    }

}

// Run when executed directly
callTestRailGetSectionApi().catch(err => {
    console.error('Unhandled error in callTestRailGetSectionApi:', err);
});