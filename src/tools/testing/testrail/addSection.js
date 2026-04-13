const fs = require('fs');
const csv = require('csv-parser');
const { stringify } = require('csv-stringify/sync');

async function callTestRailAddSectionApi(name, description) {
    const projectId = 162;
    const parentId = 101306;
    const suitId = 4710;
    const url = `https://tiket.testrail.com/index.php?/api/v2/add_section/${projectId}`;
    const auth = 'Basic ' + Buffer.from('yanuar.kurniawan@tiket.com:Tiket123').toString('base64');

    const body = JSON.stringify({
        "suite_id": suitId,
        "name": name,
        "description": description,
        "parent_id": parentId
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth
            },
            body: body
        });

        const data = await response.json();
        console.log('Response from TestRail API:', data);
        return data;
    } catch (error) {
        console.error('Error calling TestRail API:', error);
    }
}

async function addSection(filePath) {
    console.log(`Adding section from file: ${filePath}`);
    const totalRows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', async (row) => {
            console.log(`Processing row: ${row.foldername}`);
            totalRows.push(row);
        })
        .on('end', async () => {
            console.log('CSV file successfully processed with rows:', totalRows.length);
            for (const row of totalRows) {
                let response = null;
                try {
                    response = await callTestRailAddSectionApi(row.foldername, row.endpoint);
                } catch (error) {
                    console.error(`Error processing row ${row.foldername}:`, error);
                }
                const id = response && response.id ? response.id : '';
                row.id = id;
                console.log(`Added section with ID: ${id}`);
                // To avoid hitting rate limits, you might want to add a small delay here
                await new Promise(resolve => setTimeout(resolve, 700));

            }

            const output = stringify(totalRows, { header: true, columns: ['endpoint', 'foldername', 'id'] });
            fs.writeFileSync(filePath, output);
        });
}

addSection('final.csv');