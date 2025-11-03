import fs from 'fs';
import { spawn } from 'child_process';

const csvFile = 'data.csv';
const rowCount = fs.readFileSync

const k6 = spawn('k6', [
    'run',
    '--vus', `CSV_ROWS=${rowCount}`,
    'test.js'
]);

k6.stdout.on('data', (data) => process.stdout.write(data));
k6.stderr.on('data', (data) => process.stderr.write(data));
k6.on('close', (code) => {
    if (code !== 0) {
        console.error(`k6 process exited with code ${code}`);
    } else {
        console.log('k6 run completed successfully');
    }
});