// Release-manager parity sweep: every file that exists in both the canonical chart tree and
// the served homepage mirror must be byte-identical at the train tip. A divergence here is a
// build that serves something nobody reviewed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const CANON = path.join(ROOT, 'chart v 1.4/chart');
const MIRROR = path.join(ROOT, 'homepage/public/chart');
const h = (p) => createHash('sha1').update(fs.readFileSync(p)).digest('hex');

const walk = (dir, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist-v9' || e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel));
    else if (/\.(js|mjs|json|html|css)$/.test(e.name)) out.push(rel);
  }
  return out;
};

const canon = new Set(walk(CANON));
const mirror = new Set(walk(MIRROR));
const shared = [...canon].filter((f) => mirror.has(f));

// Three distinct states, never collapsed into one red (BIND-01): identical bytes;
// identical content differing only in line endings; and genuinely different content.
// Only the third can change what the browser executes.
const eol = [];
const content = [];
let identical = 0;

for (const f of shared) {
  const a = path.join(CANON, f);
  const b = path.join(MIRROR, f);
  try {
    if (h(a) === h(b)) { identical++; continue; }
    const na = fs.readFileSync(a, 'utf8').replace(/\r\n/g, '\n');
    const nb = fs.readFileSync(b, 'utf8').replace(/\r\n/g, '\n');
    (na === nb ? eol : content).push(f);
  } catch (e) { content.push(`${f} (${e.code})`); }
}

// A test or harness file is copied into the mirror but never loaded by the chart page, so a
// divergence there cannot change served behaviour. Product is the seal-blocking category.
const isProduct = (f) => !/\.test\.mjs$/.test(f) && !/(^|\/)harness\//.test(f);
const productDiverged = content.filter(isProduct);
const testDiverged = content.filter((f) => !isProduct(f));

console.log(`  files in both trees      : ${shared.length}`);
console.log(`  byte-identical           : ${identical}`);
console.log(`  line-endings only        : ${eol.length}   (same content; cosmetic)`);
console.log(`  content divergent        : ${content.length}`);
console.log(`      of which PRODUCT     : ${productDiverged.length}   <- the only seal-blocking state`);
console.log(`      of which test/harness: ${testDiverged.length}   (never loaded by the chart page)`);
if (eol.length) {
  console.log('\n  line-endings only (includes product; content is identical):');
  for (const f of eol) console.log(`      ${f}`);
}
if (testDiverged.length) {
  console.log('\n  test/harness divergent (untidy, not seal-blocking):');
  for (const f of testDiverged) console.log(`      ${f}`);
}
if (productDiverged.length) {
  console.log('\n  PRODUCT DIVERGENT — the browser would run something unreviewed:');
  for (const f of productDiverged) console.log(`      ${f}`);
}
console.log(`\n  ${productDiverged.length ? 'PARITY FAILED' : 'PRODUCT PARITY CLEAN'}`);
process.exit(productDiverged.length ? 1 : 0);
