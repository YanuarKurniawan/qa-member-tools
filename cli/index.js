const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const registry = require('../src/registry');
const { parseCsvFile } = require('../src/lib/csvParser');

const SERVICES_DIR = path.join(__dirname, '../src/services');

async function main() {
  const [toolId, csvPath, ...args] = process.argv.slice(2);

  if (!toolId || toolId === '--help' || toolId === '-h') {
    console.log('Usage: node cli/index.js <tool-id> [csv-path] [key=value ...]');
    console.log('\nAvailable tools:');
    const grouped = {};
    for (const t of registry) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    }
    for (const [cat, tools] of Object.entries(grouped)) {
      console.log(`\n  ${cat}:`);
      for (const t of tools) {
        console.log(`    ${t.id.padEnd(28)} ${t.description}`);
      }
    }
    process.exit(0);
  }

  const tool = registry.find((t) => t.id === toolId);
  if (!tool) {
    console.error(`Unknown tool: ${toolId}`);
    console.log('Run with --help to see available tools');
    process.exit(1);
  }

  const serviceFn = require(path.join(SERVICES_DIR, tool.service));
  const rows = csvPath && !csvPath.includes('=') ? await parseCsvFile(csvPath) : [];
  const extraArgs = csvPath && csvPath.includes('=') ? [csvPath, ...args] : args;
  const options = Object.fromEntries(
    extraArgs.map((a) => a.split('=')).filter((p) => p.length === 2)
  );

  const onLog = {
    info: (msg) => console.log(`[INFO]    ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${msg}`),
    error: (msg) => console.error(`[ERROR]   ${msg}`),
    warn: (msg) => console.warn(`[WARN]    ${msg}`),
  };

  const fn = typeof serviceFn === 'function' ? serviceFn : serviceFn.preview;
  const { results } = await fn({ rows, options, onLog });

  if (results?.length) {
    console.log('\nResults:');
    console.table(results);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
