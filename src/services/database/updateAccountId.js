const config = require('../../lib/config');
const sleep = require('../../lib/sleep');

const TARGET_TABLES = [
  'members_account_b2c',
  'members_profile_b2c',
  'registration_source',
  'login_devices',
];

const INT_TYPE_MAX = {
  tinyint: 127,
  smallint: 32767,
  mediumint: 8388607,
  int: 2147483647,
};

function getPool() {
  return require('../../lib/db');
}

async function discoverColumns(pool) {
  const dbName = config.DB_NAME;
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

module.exports = async function updateAccountId({ rows, options, onLog }) {
  const { oldAccountId, newAccountId, dryRun } = options;
  const isDryRun = dryRun === true || dryRun === 'true';

  if (!oldAccountId || !newAccountId) {
    throw new Error('oldAccountId and newAccountId are required');
  }

  const pool = getPool();
  onLog.info(`Database: ${config.DB_NAME}`);
  onLog.info(`Old ID: ${oldAccountId} → New ID: ${newAccountId}`);
  onLog.info(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

  const columns = await discoverColumns(pool);
  onLog.info(`Found ${columns.length} accountId columns across target tables`);

  columns.forEach((c) => onLog.info(`  ${c.TABLE_NAME}.${c.COLUMN_NAME} (${c.DATA_TYPE})`));

  const overflow = columns.filter((c) => {
    const max = INT_TYPE_MAX[c.DATA_TYPE];
    return max !== undefined && Number(newAccountId) > max;
  });

  if (overflow.length > 0) {
    onLog.error(`New ID ${newAccountId} exceeds column type range`);
    throw new Error('Account ID too large for column types');
  }

  if (isDryRun) {
    onLog.success('Dry run complete — no changes made');
    return {
      results: columns.map((c) => ({
        table: c.TABLE_NAME,
        column: c.COLUMN_NAME,
        type: c.DATA_TYPE,
        status: 'DRY_RUN',
      })),
    };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const results = [];

    for (const col of columns) {
      const sql = `UPDATE \`${col.TABLE_NAME}\` SET \`${col.COLUMN_NAME}\` = ? WHERE \`${col.COLUMN_NAME}\` = ?`;
      const [result] = await connection.query(sql, [newAccountId, oldAccountId]);
      const status = result.affectedRows > 0 ? `${result.affectedRows} row(s)` : 'no match';
      onLog.info(`${col.TABLE_NAME}.${col.COLUMN_NAME} → ${status}`);
      results.push({
        table: col.TABLE_NAME,
        column: col.COLUMN_NAME,
        affectedRows: result.affectedRows,
        status: result.affectedRows > 0 ? 'UPDATED' : 'NO_MATCH',
      });
    }

    await connection.commit();
    const totalRows = results.reduce((s, r) => s + r.affectedRows, 0);
    onLog.success(`Done. ${totalRows} total row(s) updated`);
    return { results };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
