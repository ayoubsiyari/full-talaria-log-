import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const csv = fs.readFileSync(path.join(ROOT, 'docs/tickets-overhaul/PER-BUG-REGISTRY.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
const byRc = {};
const byFam = {};
for (const line of csv) {
  const cols = [];
  let c = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; }
      else if (ch === '"') q = false;
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { cols.push(c); c = ''; }
    else c += ch;
  }
  cols.push(c);
  byRc[cols[4]] = (byRc[cols[4]] || 0) + 1;
  byFam[cols[3]] = (byFam[cols[3]] || 0) + 1;
}
const hand = ['TAL-00157', 'TAL-00322', 'TAL-00323', 'TAL-00752', 'TAL-00117', 'TAL-00228', 'TAL-00245', 'TAL-00350', 'TAL-00271'];
let handRows = 0;
for (const line of csv) {
  if (hand.some((h) => line.includes(`${h}#`))) handRows++;
}
console.log(JSON.stringify({ rows: csv.length, byRc, byFam, handRows, autoRows: csv.length - handRows }, null, 2));

const pairs = ['interactive-helpers.mjs', 'scenarios.mjs', 'known-failing.json', 'harness-lib.mjs', 'run.mjs', 'gate.mjs', 'serve.mjs'];
const canon = path.join(ROOT, 'chart v 1.4/chart/multichart-prod/harness');
const home = path.join(ROOT, 'homepage/public/chart/multichart-prod/harness');
console.log('\nSHA256 pairs:');
for (const f of pairs) {
  const h1 = crypto.createHash('sha256').update(fs.readFileSync(path.join(canon, f))).digest('hex');
  const h2 = crypto.createHash('sha256').update(fs.readFileSync(path.join(home, f))).digest('hex');
  console.log(`${f}: ${h1 === h2 ? 'MATCH' : 'MISMATCH'} ${h1}`);
}
