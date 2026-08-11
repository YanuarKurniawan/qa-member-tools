const fs = require('fs');

const lines = fs
  .readFileSync('users-lookup.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1);

const rows = lines.map((l) => {
  const [userId, email, cc, nn] = l.split(',');
  return { userId, email, cc, nn, e164: `${cc}${nn}` };
});

const withPhone = rows.filter((r) => r.nn && r.nn.length);
const withoutPhone = rows.filter((r) => !r.nn || !r.nn.length);

console.log('=== PER-NUMBER CHECK ===');
console.log(
  ['e164', 'cc', 'natLen', 'startsWith', 'idMobileValid'].join('\t')
);
for (const r of withPhone) {
  // Indonesian mobile: national number starts with 8, total national length 9-12.
  const idValid =
    r.cc === '+62' ? /^8\d{8,11}$/.test(r.nn) : 'n/a';
  console.log(
    [r.e164, r.cc, r.nn.length, r.nn[0], idValid].join('\t')
  );
}

console.log('\n=== GROUPINGS ===');
const byCc = {};
for (const r of withPhone) byCc[r.cc] = (byCc[r.cc] || 0) + 1;
console.log('country codes:', byCc);

const byLen = {};
for (const r of withPhone) byLen[r.nn.length] = (byLen[r.nn.length] || 0) + 1;
console.log('national number lengths:', byLen);

const byFirst = {};
for (const r of withPhone) byFirst[r.nn[0]] = (byFirst[r.nn[0]] || 0) + 1;
console.log('first digit of national number:', byFirst);

console.log('\ninvalid as real ID mobile (+62 but not 8xxxxxxxx):');
for (const r of withPhone) {
  if (r.cc === '+62' && !/^8\d{8,11}$/.test(r.nn)) {
    console.log(`  ${r.e164}  ${r.email}`);
  }
}

console.log('\nno phone on file:');
for (const r of withoutPhone) console.log(`  ${r.email} (cc="${r.cc}")`);

console.log('\nduplicate national numbers:');
const seen = {};
for (const r of withPhone) (seen[r.nn] = seen[r.nn] || []).push(r.email);
for (const [nn, emails] of Object.entries(seen)) {
  if (emails.length > 1) console.log(`  ${nn} -> ${emails.join(', ')}`);
}

// --- Regex generation ---
const e164s = withPhone.map((r) => r.e164);

console.log('\n=== 1. EXACT ALTERNATION (E.164) ===');
console.log(
  '^\\+(' + e164s.map((s) => s.slice(1)).join('|') + ')$'
);

// Trie-compress the digit strings into a compact pattern.
function buildTrie(words) {
  const root = {};
  for (const w of words) {
    let node = root;
    for (const ch of w) node = node[ch] = node[ch] || {};
    node.$ = true;
  }
  return root;
}

function trieToRegex(node) {
  const keys = Object.keys(node).filter((k) => k !== '$');
  if (!keys.length) return '';
  const alts = [];
  // Collapse single-character leaf branches into a character class.
  const charClass = [];
  for (const k of keys) {
    const sub = trieToRegex(node[k]);
    if (sub === '') charClass.push(k);
    else alts.push(k + sub);
  }
  if (charClass.length === 1) alts.push(charClass[0]);
  else if (charClass.length > 1) alts.push('[' + charClass.join('') + ']');

  let out = alts.length === 1 ? alts[0] : '(?:' + alts.join('|') + ')';
  if (node.$ && alts.length) out += '?';
  return out;
}

console.log('\n=== 2. TRIE-COMPRESSED (E.164) ===');
console.log('^\\+' + trieToRegex(buildTrie(e164s.map((s) => s.slice(1)))) + '$');

console.log('\n=== 3. NATIONAL NUMBER ONLY ===');
const nns = [...new Set(withPhone.map((r) => r.nn))].sort();
console.log('^(' + nns.join('|') + ')$');

console.log('\n=== 4. FLEXIBLE (matches +62 8..., 062..., 62..., 08...) ===');
const idNns = withPhone.filter((r) => r.cc === '+62').map((r) => r.nn);
console.log(
  '^(?:\\+?62|0)(' + [...new Set(idNns)].sort().join('|') + ')$'
);

console.log('\n=== 5. GENERALISED SHAPE ===');
const lens = withPhone.map((r) => r.nn.length);
const firsts = [...new Set(withPhone.map((r) => r.nn[0]))].sort().join('');
console.log(
  `^\\+(?:62|91)[${firsts}]\\d{${Math.min(...lens) - 1},${Math.max(...lens) - 1}}$`
);
