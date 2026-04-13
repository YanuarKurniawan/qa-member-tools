const fs = require('fs');
const csv = require('csv-parser');
const pool = require('../../lib/db');

const TARGET_TABLES = [
  'members_account_b2c',
  'members_profile_b2c',
  'registration_source',
  'login_devices',
];

const INT_TYPE_MAX = {
  tinyint:   127,
  smallint:  32767,
  mediumint: 8388607,
  int:       2147483647,
};

const DELAY_MS = 2000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find(a => !a.startsWith('--'));

if (!csvPath) {
  console.error('Usage: node bulk-update-account-id.js <csv-file> [--dry-run]');
  console.error('  CSV must have columns: accountId, newAccountId');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function discoverColumns() {
  const dbName = process.env.DB_NAME;
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME IN (${TARGET_TABLES.map(() => '?').join(', ')})
       AND COLUMN_NAME = 'accountId'
     ORDER BY TABLE_NAME, COLUMN_NAME`,
    [dbName, ...TARGET_TABLES]
  );
  return rows;
}

async function updateSingleAccount(columns, oldId, newId, index, total) {
  const label = `[${index + 1}/${total}] ${oldId} → ${newId}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const results = [];
    for (const col of columns) {
      const sql = `UPDATE \`${col.TABLE_NAME}\` SET \`${col.COLUMN_NAME}\` = ? WHERE \`${col.COLUMN_NAME}\` = ?`;
      const [result] = await connection.query(sql, [newId, oldId]);
      results.push({ table: col.TABLE_NAME, affectedRows: result.affectedRows });
    }

    await connection.commit();

    const updated = results.filter(r => r.affectedRows > 0);
    const totalRows = results.reduce((sum, r) => sum + r.affectedRows, 0);

    if (totalRows > 0) {
      const detail = updated.map(r => `${r.table}(${r.affectedRows})`).join(', ');
      console.log(`  ✔ ${label} — ${totalRows} row(s) in ${updated.length} table(s): ${detail}`);
    } else {
      console.log(`  – ${label} — no matching rows`);
    }

    return { oldId, newId, totalRows, status: 'ok' };
  } catch (err) {
    await connection.rollback();
    console.error(`  ✖ ${label} — rolled back: ${err.message}`);
    return { oldId, newId, totalRows: 0, status: 'error', error: err.message };
  } finally {
    connection.release();
  }
}

async function run() {
  console.log(`\nDatabase: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`CSV file: ${csvPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Target tables: ${TARGET_TABLES.join(', ')}`);
  console.log(`Delay between accounts: ${DELAY_MS / 1000}s\n`);

  const rows = await parseCsv(csvPath);

  if (rows.length === 0) {
    console.error('CSV file is empty.');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const first = rows[0];
  if (!('accountId' in first) || !('newAccountId' in first)) {
    console.error(`CSV must have "accountId" and "newAccountId" columns.`);
    console.error(`Found columns: ${Object.keys(first).join(', ')}`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const invalid = rows.filter((r, i) => !r.accountId || !r.newAccountId);
  if (invalid.length > 0) {
    console.error(`${invalid.length} row(s) have empty accountId or newAccountId. Please fix the CSV.`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log(`Found ${rows.length} account(s) to update.\n`);

  console.log('--- Resolving target columns ---\n');
  const columns = await discoverColumns();

  const found = new Set(columns.map(c => c.TABLE_NAME));
  const missing = TARGET_TABLES.filter(t => !found.has(t));

  if (missing.length > 0) {
    console.warn(`⚠  Table(s) not found or missing accountId column: ${missing.join(', ')}\n`);
  }

  if (columns.length === 0) {
    console.log('No matching columns found in target tables.');
    await pool.end();
    return;
  }

  const maxTable = Math.max(...columns.map(c => c.TABLE_NAME.length), 'Table'.length);
  const maxCol = Math.max(...columns.map(c => c.COLUMN_NAME.length), 'Column'.length);
  const maxType = Math.max(...columns.map(c => c.DATA_TYPE.length), 'Type'.length);

  console.log(`  ${'Table'.padEnd(maxTable)}  ${'Column'.padEnd(maxCol)}  ${'Type'.padEnd(maxType)}`);
  console.log(`  ${'─'.repeat(maxTable)}  ${'─'.repeat(maxCol)}  ${'─'.repeat(maxType)}`);
  columns.forEach(c => {
    console.log(`  ${c.TABLE_NAME.padEnd(maxTable)}  ${c.COLUMN_NAME.padEnd(maxCol)}  ${c.DATA_TYPE.padEnd(maxType)}`);
  });
  console.log();

  const overflowRows = rows.filter(r => {
    return columns.some(c => {
      const max = INT_TYPE_MAX[c.DATA_TYPE];
      return max !== undefined && Number(r.newAccountId) > max;
    });
  });

  if (overflowRows.length > 0) {
    const intCols = columns.filter(c => INT_TYPE_MAX[c.DATA_TYPE] !== undefined);
    console.error(`✖  Cannot proceed. ${overflowRows.length} row(s) in the CSV have a newAccountId that exceeds column type range:\n`);
    overflowRows.slice(0, 10).forEach(r => {
      console.error(`   accountId ${r.accountId} → newAccountId ${r.newAccountId}`);
    });
    if (overflowRows.length > 10) console.error(`   ... and ${overflowRows.length - 10} more`);
    console.error(`\n   Affected column(s):`);
    intCols.forEach(c => {
      console.error(`   ${c.TABLE_NAME}.${c.COLUMN_NAME} → type "${c.DATA_TYPE}" (max ${INT_TYPE_MAX[c.DATA_TYPE].toLocaleString()})`);
    });
    console.error(`\n   These columns need to be altered to BIGINT before updating, or use smaller account IDs.`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('Dry run complete. No changes were made.');
    await pool.end();
    return;
  }

  console.log('--- Updating accounts ---\n');

  const summary = [];
  for (let i = 0; i < rows.length; i++) {
    const { accountId, newAccountId } = rows[i];
    const result = await updateSingleAccount(columns, accountId, newAccountId, i, rows.length);
    summary.push(result);

    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  const succeeded = summary.filter(s => s.status === 'ok');
  const failed = summary.filter(s => s.status === 'error');
  const totalRows = summary.reduce((sum, s) => sum + s.totalRows, 0);

  console.log(`\n--- Summary ---\n`);
  console.log(`  Total accounts: ${summary.length}`);
  console.log(`  Succeeded: ${succeeded.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Total rows updated: ${totalRows}`);

  if (failed.length > 0) {
    console.error(`\n  Failed accounts:`);
    failed.forEach(f => {
      console.error(`    ${f.oldId} → ${f.newId}: ${f.error}`);
    });
    process.exitCode = 1;
  }

  await pool.end();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
