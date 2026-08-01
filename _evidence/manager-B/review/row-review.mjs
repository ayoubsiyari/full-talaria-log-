#!/usr/bin/env node
/**
 * ROW REVIEW AID — surfaces the defect classes this project keeps producing, per landed row.
 *
 *   node _evidence/manager-B/review/row-review.mjs <commit-ish> [--repo=DIR]
 *   node _evidence/manager-B/review/row-review.mjs <base>..<head>
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────
 *
 * This does NOT approve a row and a clean run is NOT a review. It cannot tell you whether a
 * fix is correct, whether the money path is still sound, or whether the behaviour changed in
 * the way the row claims. Those need the row's own oracle and a human reading the diff.
 *
 * What it does is refuse to let the SAME five mistakes through a sixth time, in seconds
 * rather than minutes, so continuous review can keep pace with three managers cherry-picking
 * in parallel. Every finding below was a real defect in this project in the last two days:
 *
 *   1. MIRROR DRIFT      A canonical chart file changed without its homepage mirror. A shipped
 *                        a mutation-test artefact into the product mirror at 41c34d1ea; the
 *                        b121 uniformity proof found 60 module files drifted out of the mirror.
 *   2. TEST IN PRODUCT   .test/.red/.mutants/fixture files added under homepage/public, i.e.
 *                        into bytes the browser is served.
 *   3. UNBOUND FIX       A new symbol defined and never referenced anywhere else. Four of these
 *                        in PASSPORT-3 alone: the fix and its gate both on the tier I had
 *                        edited, never on the tier that serves the request.
 *   4. MONEY PATH        order-manager / journal / trade-state touched, which means the row does
 *                        not self-certify and a money-path oracle is required.
 *   5. SWITCHLESS        Product behaviour changed with no __TALARIA_* kill switch in the diff.
 *
 * Findings are BLOCK (do not approve until answered) or NOTE (look, then judge).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'HEAD';
const REPO = (args.find((a) => a.startsWith('--repo=')) || '').split('=')[1] || process.cwd();

const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const range = target.includes('..') ? target : `${target}~1..${target}`;
// The tip being reviewed. Every content check reads blobs AT THIS COMMIT, never the working
// tree: a review that reads the checkout reports whatever the reviewer happens to have, which
// is how A's mirror defect at 41c34d1ea first scanned clean here (A had since repaired it in a
// later commit, so the working tree was fine while the reviewed commit was not). Same failure
// as the LIFE-4 and LAG-1a gates defaulting to D's worktree.
const TIP = range.split('..').pop();
/** File bytes at the reviewed commit, or null if the path does not exist there. */
const blobAt = (p) => {
  try {
    return execFileSync('git', ['-C', REPO, 'show', `${TIP}:${p}`],
      { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
};

let block = 0, note = 0;
const BLOCK = (m, detail) => { console.log(`  BLOCK  ${m}`); if (detail) console.log(detail); block++; };
const NOTE  = (m, detail) => { console.log(`  NOTE   ${m}`); if (detail) console.log(detail); note++; };
const OK    = (m) => console.log(`  ok     ${m}`);

// ── the row itself ──────────────────────────────────────────────────────────────────────
let subject, files;
try {
  subject = git('log', '-1', '--format=%h %an %ad%n         %s', '--date=short', target).trim();
  files = git('diff', '--name-only', range).split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.log(`FATAL cannot read ${range} in ${REPO}\n${e.message}`);
  process.exit(2);
}

console.log(`\n=== ROW REVIEW: ${range} ===\n  ${subject}\n  ${files.length} files changed\n`);

const isDoc = (f) => /^(docs|_evidence)\//.test(f) || /\.md$/.test(f);
const isTestArtefact = (f) => /\.(test|red|mutants|spec|acceptance)\.(mjs|js)$/.test(f)
  || /(^|\/)(b-)?fixtures?\//.test(f) || /-notgate\./.test(f);
const product = files.filter((f) => !isDoc(f));

// ── 1. mirror drift ─────────────────────────────────────────────────────────────────────
console.log('--- 1. canonical <-> homepage mirror parity ---');
const CANON = 'chart v 1.4/chart/';
const MIRROR = 'homepage/public/chart/';
const toMirror = (f) => f.startsWith(CANON) ? MIRROR + f.slice(CANON.length) : null;
const toCanon  = (f) => f.startsWith(MIRROR) ? CANON + f.slice(MIRROR.length) : null;

const pairs = new Map();
for (const f of product) {
  const m = toMirror(f), c = toCanon(f);
  if (m) pairs.set(f, m);
  else if (c) pairs.set(c, f);
}
if (!pairs.size) OK('row touches no mirrored chart files');
for (const [canon, mirror] of pairs) {
  const cb = blobAt(canon), mb = blobAt(mirror);
  // A product file and a test file have different consequences when the mirror is missing, and
  // collapsing them into one severity makes the real one easy to miss. A product file absent
  // from the mirror means the browser runs something this review never saw. A .test.mjs absent
  // from the mirror is invisible to the browser -- but it still fails the checkpoint uniformity
  // proof, which is what stopped the b121 ckpt-ship run with 60 drifted module files.
  const isTest = isTestArtefact(canon);
  const sev = isTest ? NOTE : BLOCK;
  const why = isTest
    ? '         not served, but this will fail the checkpoint uniformity proof at cut time'
    : '         the browser would run something that was not reviewed here';
  if (!cb && !mb) { NOTE(`both copies deleted: ${canon}`); continue; }
  if (!mb) { sev(`mirror MISSING for ${canon}`, `         expected ${mirror}\n${why}`); continue; }
  if (!cb) { sev(`canonical MISSING for ${mirror}`, `         expected ${canon}\n${why}`); continue; }
  if (cb.equals(mb)) { OK(`byte-identical: ${canon.slice(CANON.length)}`); continue; }
  const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
  if (norm(cb) === norm(mb)) NOTE(`line-endings only (content identical): ${canon.slice(CANON.length)}`);
  else sev(`CONTENT DIVERGES between canonical and mirror: ${canon.slice(CANON.length)}`, why);
}

// ── 2. test artefacts in served bytes ───────────────────────────────────────────────────
console.log('\n--- 2. test artefacts inside the product mirror ---');
const leaked = files.filter((f) => f.startsWith(MIRROR) && isTestArtefact(f));
if (!leaked.length) OK('no test/mutant/fixture files added under homepage/public');
else BLOCK(`${leaked.length} test artefact(s) added to served bytes`, leaked.map((f) => `         ${f}`).join('\n'));

// ── 3. unbound symbols ──────────────────────────────────────────────────────────────────
console.log('\n--- 3. new symbols that nothing references (present but unbound) ---');
const codeFiles = product.filter((f) => /\.(js|mjs)$/.test(f) && !isTestArtefact(f));
let checkedSyms = 0;
const declRe = /^\+\s*(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/;
for (const f of codeFiles) {
  let diff = '';
  try { diff = git('diff', range, '--', f); } catch { continue; }
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const syms = new Set();
  for (const line of added) {
    const m = declRe.exec(line);
    if (m) syms.add(m[1] || m[2]);
  }
  for (const s of syms) {
    if (!s || s.length < 4) continue;
    checkedSyms++;
    // Searched at the reviewed commit, not the checkout, for the same reason as the mirror check.
    let hits = 0;
    try {
      hits = git('grep', '-l', '-e', s, TIP).split('\n').filter(Boolean).length;
    } catch { hits = 0; }
    const selfOnly = hits <= 1;
    if (selfOnly) NOTE(`'${s}' appears only in ${path.basename(f)} — defined but never called?`,
      `         if this is a fix, it may be RESOLVER_PRESENT_BUT_UNCALLED`);
  }
}
if (!checkedSyms) OK('no new top-level symbols introduced');
else if (!note) OK(`${checkedSyms} new symbol(s), all referenced from more than one file`);

// ── 4. money path ───────────────────────────────────────────────────────────────────────
console.log('\n--- 4. money path ---');
const MONEY = /(order-manager|order-entry|trade-|journal|position|pnl|sltp)/i;
const moneyFiles = product.filter((f) => MONEY.test(f) && !isTestArtefact(f));
if (!moneyFiles.length) OK('row does not touch the money path');
else BLOCK(`money-path files touched — row does NOT self-certify, oracle required`,
  moneyFiles.map((f) => `         ${f}`).join('\n'));

// ── 5. kill switch ──────────────────────────────────────────────────────────────────────
console.log('\n--- 5. kill switch ---');
let allDiff = '';
try { allDiff = git('diff', range, '--', ...(product.length ? product : ['.'])); } catch {}
const switches = [...new Set((allDiff.match(/__TALARIA_[A-Z0-9_]+/g) || []))];
const touchesBehaviour = codeFiles.some((f) => !/scripts\//.test(f));
if (switches.length) OK(`kill switch present: ${switches.join(', ')}`);
else if (touchesBehaviour) NOTE('product behaviour changed with no __TALARIA_* switch in the diff',
  '         confirm the row is switchable, or that the roster exempted it');
else OK('no product behaviour change requiring a switch');

// ── verdict ─────────────────────────────────────────────────────────────────────────────
console.log(`\n================ ${block} BLOCK, ${note} NOTE ================`);
if (block) console.log('\n  Do not approve until each BLOCK is answered.');
console.log('  A clean run is not an approval: it means these five known hazards are absent.');
console.log('  Correctness still needs the row\'s oracle and a human reading the diff.\n');
process.exitCode = block ? 1 : 0;
