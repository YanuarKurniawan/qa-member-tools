const config = require('../../lib/config');
const sleep = require('../../lib/sleep');
const { parseCsvFile } = require('../../lib/csvParser');

const TARGET_TABLES = [
  'members_account_b2c',
  'members_profile_b2c',
  'registration_source',
  'login_devices',
];

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

module.exports = async function bulkUpdateAccountId({ rows, options, onLog }) {
  const isDryRun = options.dryRun === 'true' || options.dryRun === true;

  const pool = getPool();
  onLog.info(`Loaded ${rows.length} account(s) from CSV`);
  onLog.info(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

  const columns = await discoverColumns(pool);
  onLog.info(`Found ${columns.length} accountId columns`);

  if (isDryRun) {
    onLog.success('Dry run complete — no changes made');
    return {
      results: rows.map((r) => ({ ...r, status: 'DRY_RUN' })),
    };
  }

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const { accountId, newAccountId } = rows[i];
    const label = `[${i + 1}/${rows.length}] ${accountId} → ${newAccountId}`;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let totalRows = 0;

      for (const col of columns) {
        const sql = `UPDATE \`${col.TABLE_NAME}\` SET \`${col.COLUMN_NAME}\` = ? WHERE \`${col.COLUMN_NAME}\` = ?`;
        const [result] = await connection.query(sql, [newAccountId, accountId]);
        totalRows += result.affectedRows;
      }

      await connection.commit();
      onLog.success(`${label} — ${totalRows} row(s) updated`);
      results.push({ accountId, newAccountId, rowsUpdated: totalRows, status: 'SUCCESS' });
    } catch (err) {
      await connection.rollback();
      onLog.error(`${label} — rolled back: ${err.message}`);
      results.push({ accountId, newAccountId, rowsUpdated: 0, status: 'ERROR', error: err.message });
    } finally {
      connection.release();
    }

    if (i < rows.length - 1) await sleep(2000);
  }

  const succeeded = results.filter((r) => r.status === 'SUCCESS').length;
  onLog.success(`Complete: ${succeeded}/${rows.length} succeeded`);
  return { results };
};
