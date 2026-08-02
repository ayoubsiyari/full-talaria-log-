/**
 * The three coordinates of the deployed build, read from the origin rather than from the repo:
 * badge, served digest, and source commit SHA.
 *
 * Uses C's own computeSeal so the digest is the same number the soak harness will re-verify on every
 * three-minute sample -- a digest computed a different way would agree today and diverge tonight.
 */
import { computeSeal } from '../../../scripts/lib/seal.mjs';

const ORIGIN = process.argv.find((a) => a.startsWith('--origin='))?.split('=')[1]
  || 'http://31.97.192.82:3000';

const seal = await computeSeal(ORIGIN, { timeoutMs: 30000 });

console.log(`\n  origin : ${ORIGIN}`);
console.log(`  ok     : ${seal.ok}`);
console.log(`  badge  : ${seal.badge}`);
console.log(`  digest : ${seal.digest || seal.sha256 || JSON.stringify(Object.keys(seal))}`);

console.log('\n  files the seal covers:');
for (const f of seal.files || []) {
  if (f.error) console.log(`    ERROR  ${f.path}  ${f.error}`);
  else console.log(`    ${String(f.status).padEnd(4)} ${String(f.bytes).padStart(9)} B  ${f.sha256.slice(0, 16)}…  ${f.path}`);
}

const res = await fetch(`${ORIGIN}/chart/build-info.json`, { signal: AbortSignal.timeout(20000) });
const bi = await res.json();
console.log('\n  passport:');
console.log(`    buildId         : ${bi.buildId}`);
console.log(`    sourceCommitSha : ${bi.sourceCommitSha}`);
console.log(`    checkpointBuild : ${bi.checkpointBuild}`);

console.log('\n  SPEED-01 in the SERVED bytes:');
for (const p of ['/chart/modules/replay-system.js']) {
  const r = await fetch(`${ORIGIN}${p}`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  const html = /^\s*<(!doctype|html)/i.test(t);
  console.log(`    ${p}  http=${r.status} bytes=${t.length}${html ? '  (HTML, not the module)' : ''}`);
  if (!html) {
    console.log(`      __talariaEffectiveRate : ${(t.match(/__talariaEffectiveRate/g) || []).length}`);
    console.log(`      REALISTIC              : ${(t.match(/REALISTIC/g) || []).length}`);
    console.log(`      old 100x ladder        : ${(t.match(/100x/g) || []).length}`);
  }
}
