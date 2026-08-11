const fs = require('fs');

const rows = fs
  .readFileSync('users-lookup.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => {
    const [userId, email, cc, nn] = l.split(',');
    return { email, cc, nn, e164: `${cc}${nn}` };
  })
  .filter((r) => r.nn);

const exact =
  /^\+(628179170472|628135156333|6295255671347|629525561367|62897654334|629140273295|627525561347|62813456879077|628123568899|629554616408|625523466748|919525561347|628976543210|628123789122|628135156376|626431443067|622626171811|629525261347|625262718110|6288782523391|628178987867|628181765656)$/;

const trie =
  /^\+(?:62(?:2626171811|5(?:262718110|523466748)|6431443067|7525561347|8(?:1(?:23(?:568899|789122)|3(?:456879077|51563(?:33|76))|7(?:8987867|9170472)|81765656)|8782523391|976543(?:210|34))|9(?:140273295|5(?:25(?:261347|56(?:1367|71347))|54616408)))|919525561347)$/;

let pass = 0;
for (const r of rows) {
  const a = exact.test(r.e164);
  const b = trie.test(r.e164);
  if (a && b) pass++;
  else console.log(`MISS ${r.e164} exact=${a} trie=${b}`);
}
console.log(`matched ${pass}/${rows.length} real numbers with both patterns`);

// Negative cases: near-misses that must NOT match.
const negatives = [
  '+62817917047', // one digit short
  '+6281791704720', // one digit long
  '+628179170473', // last digit changed
  '+628179170472 ', // trailing space
  '08179170472', // local format
  '628179170472', // missing +
  '+629525561347', // +62 variant of the +91 number
  '+919525561367', // +91 variant of the +62 number
  '+62897654335',
  '+6289765433', // prefix of 897654334
  '+62813456879', // prefix of 813456879077
  '+',
];
let rejected = 0;
for (const n of negatives) {
  const a = exact.test(n);
  const b = trie.test(n);
  if (!a && !b) rejected++;
  else console.log(`FALSE POSITIVE "${n}" exact=${a} trie=${b}`);
}
console.log(`rejected ${rejected}/${negatives.length} negative cases`);

// Confirm the two patterns are equivalent over a brute-force digit space.
let disagree = 0;
for (let i = 0; i < 200000; i++) {
  const len = 9 + (i % 5);
  let s = '+';
  for (let j = 0; j < len; j++) s += Math.floor(Math.random() * 10);
  if (exact.test(s) !== trie.test(s)) {
    disagree++;
    console.log(`DISAGREE ${s}`);
  }
}
console.log(`random-fuzz disagreements: ${disagree}`);
