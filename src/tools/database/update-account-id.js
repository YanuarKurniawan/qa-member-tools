const pool = require('../../lib/db');

const TARGET_TABLES = [
  'members_account_b2c',
  'members_profile_b2c',
  'registration_source',
  'login_devices',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positionalArgs = args.filter(a => !a.startsWith('--'));

if (positionalArgs.length < 2) {
  console.error('Usage: node update-account-id.js <oldAccountId> <newAccountId> [--dry-run]');
  process.exit(1);
}

const oldAccountId = positionalArgs[0];
const newAccountId = positionalArgs[1];

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

const INT_TYPE_MAX = {
  tinyint:   127,
  smallint:  32767,
  mediumint: 8388607,
  int:       2147483647,
};

async function run() {
  console.log(`\nDatabase: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`Old Account ID: ${oldAccountId}`);
  console.log(`New Account ID: ${newAccountId}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Target tables: ${TARGET_TABLES.join(', ')}\n`);

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

  const header = `  ${'Table'.padEnd(maxTable)}  ${'Column'.padEnd(maxCol)}  ${'Type'.padEnd(maxType)}`;
  const separator = `  ${'─'.repeat(maxTable)}  ${'─'.repeat(maxCol)}  ${'─'.repeat(maxType)}`;

  console.log(header);
  console.log(separator);
  columns.forEach(c => {
    console.log(`  ${c.TABLE_NAME.padEnd(maxTable)}  ${c.COLUMN_NAME.padEnd(maxCol)}  ${c.DATA_TYPE.padEnd(maxType)}`);
  });
  console.log(`\nWill update ${columns.length} column(s) across ${found.size} table(s).\n`);

  const overflow = columns.filter(c => {
    const max = INT_TYPE_MAX[c.DATA_TYPE];
    return max !== undefined && Number(newAccountId) > max;
  });

  if (overflow.length > 0) {
    console.error(`✖  Cannot proceed. New account ID ${newAccountId} exceeds the max value for ${overflow.length} column(s):\n`);
    overflow.forEach(c => {
      console.error(`   ${c.TABLE_NAME}.${c.COLUMN_NAME} → type "${c.DATA_TYPE}" (max ${INT_TYPE_MAX[c.DATA_TYPE].toLocaleString()})`);
    });
    console.error(`\n   These columns need to be altered to BIGINT before updating, or use a smaller account ID.`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('Dry run complete. No changes were made.');
    await pool.end();
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    console.log('--- Updating tables ---\n');

    const results = [];

    for (const col of columns) {
      const sql = `UPDATE \`${col.TABLE_NAME}\` SET \`${col.COLUMN_NAME}\` = ? WHERE \`${col.COLUMN_NAME}\` = ?`;
      const [result] = await connection.query(sql, [newAccountId, oldAccountId]);
      results.push({
        table: col.TABLE_NAME,
        column: col.COLUMN_NAME,
        affectedRows: result.affectedRows,
      });
      const status = result.affectedRows > 0 ? `${result.affectedRows} row(s) updated` : 'no matching rows';
      console.log(`  ${col.TABLE_NAME}.${col.COLUMN_NAME} → ${status}`);
    }

    await connection.commit();

    const totalRows = results.reduce((sum, r) => sum + r.affectedRows, 0);
    console.log(`\nDone. ${totalRows} total row(s) updated across ${results.filter(r => r.affectedRows > 0).length} table(s).`);
  } catch (err) {
    await connection.rollback();
    console.error('\nTransaction rolled back due to error:', err.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
