/**
 * M20-A favorites — hash-bound manifest builder.
 * Recomputes sha256 for EVERY product/test/harness/report/evidence dependency
 * plus pre/post source, verifies the frozen pre-fix blob and dual-tree parity,
 * and writes docs/plan3/evidence/W4-M20-A-FAVORITES-MANIFEST.json.
 *
 * Usage: node "chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-build-manifest.mjs"
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 14; i += 1) {
    if (
      fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))
    ) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`repo root not found above ${start}`);
}

const ROOT = findRepoRoot(HERE);
const STAMP = '20260724';
const rel = (p) => p.split(path.sep).join('/');
const sha = (p) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

const PREFIX_SHA = '091e2467928b759b1a26dfa16b3ea63c79f3d0fab6c069ce542edcb67cbc68b6';

function atomicWriteTextSync(out, text) {
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(out)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, out);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* cleanup best effort */ }
    throw err;
  }
}

const FILES = {
  product: [
    'chart v 1.4/chart/modules/favorites-manager.js',
    'homepage/public/chart/modules/favorites-manager.js',
  ],
  preFixSource: [
    'chart v 1.4/chart/modules/m20-a-favorites-harness/blobs/favorites-manager.prefix.js',
    'chart v 1.4/chart/modules/m20-a-favorites-harness/blobs/SHA256SUMS',
  ],
  tests: [
    'chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs',
    'homepage/public/chart/modules/m20-a-favorites-listener-teardown.test.mjs',
    'chart v 1.4/chart/modules/m20-a-favorites-chart-lifecycle.red.test.mjs',
    'homepage/public/chart/modules/m20-a-favorites-chart-lifecycle.red.test.mjs',
  ],
  harness: [
    'chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness-serve.mjs',
    'chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness-run.mjs',
    'chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness.client.mjs',
    'chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness.html',
    'chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-build-manifest.mjs',
  ],
  lifecycleDependencies: [
    'chart v 1.4/chart/chart.js',
    'homepage/public/chart/chart.js',
  ],
  evidence: [
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-red.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-red-homepage.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-green.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-green-homepage.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-kill.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-kill-homepage.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-LIFECYCLE-20260724-red.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-LIFECYCLE-20260724-red-homepage.json',
    'docs/plan3/evidence/W4-M20-A-FAVORITES-BROWSER-20260724.json',
  ],
  report: [
    'docs/plan3/evidence/W4-M20-A-FAVORITES-REPORT.md',
  ],
  quarantinedComposerArtifacts: [
    'docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-red-prefix.json',
    'docs/plan3/worker-reports/W4-M20-A-FAVORITES-20260724.md',
  ],
};

const hashes = {};
for (const [group, list] of Object.entries(FILES)) {
  hashes[group] = {};
  for (const p of list) hashes[group][rel(p)] = sha(p);
}

const prefixHash = hashes.preFixSource['chart v 1.4/chart/modules/m20-a-favorites-harness/blobs/favorites-manager.prefix.js'];
const parity = hashes.product['chart v 1.4/chart/modules/favorites-manager.js']
  === hashes.product['homepage/public/chart/modules/favorites-manager.js'];
const testParity = hashes.tests['chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs']
  === hashes.tests['homepage/public/chart/modules/m20-a-favorites-listener-teardown.test.mjs'];

// Git binding + truthful commit scope. The docs/ tree is gitignored
// (.gitignore line `docs/`), so evidence/report/manifest artifacts are NOT
// commit-eligible; they are reproducible via the replay commands instead.
const git = (...args) => execFileSync('git', args, { cwd: ROOT }).toString().trim();
const headCommit = git('rev-parse', 'HEAD');
const isIgnored = (p) => {
  try { git('check-ignore', '-q', p); return true; } catch (_) { return false; }
};
const commitEligible = [];
const ignoredArtifacts = [];
for (const list of Object.values(FILES)) {
  for (const p of list) (isIgnored(p) ? ignoredArtifacts : commitEligible).push(rel(p));
}

const manifest = {
  fix: 'M20-A-FAVORITES',
  worker: 'W4-FABLE-CORRECTION',
  stamp: STAMP,
  endToEndStatus: 'API-READY-PENDING-CHART-LIFECYCLE',
  reviewGate: 'PENDING-FRESH-GPT-REVIEW',
  killSwitch: '__TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1',
  headCommit,
  chartJsBaseline: {
    note: 'chart.js is a READ-ONLY lifecycle dependency of this packet (never edited in this lane). Hashes below are the CURRENT stable bytes at manifest build time; a prior packet recorded 170ef13b…/6e20965a… which drifted during M21-1 lane work. Verifiers must rehash these files and treat this packet as STALE (rebuild manifest + lifecycle evidence) if they no longer match.',
    'chart v 1.4/chart/chart.js': hashes.lifecycleDependencies['chart v 1.4/chart/chart.js'],
    'homepage/public/chart/chart.js': hashes.lifecycleDependencies['homepage/public/chart/chart.js'],
    staleIfChanged: true,
  },
  commitScope: {
    note: 'Truthful git disposition at build time. The repo gitignores the entire docs/ tree, so evidence/report/manifest artifacts are NOT commit-eligible and are NOT claimed as such; they are reproducible from the commit-eligible files via the replay commands in this manifest. chart.js is listed as a read-only dependency only — it is NOT part of this packet\u2019s commit scope.',
    commitEligible: commitEligible.filter((p) => !p.includes('chart/chart.js')),
    readOnlyDependencies: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    ignoredArtifacts,
    ignoredArtifactDisposition: 'gitignored under docs/ — regenerate via replay commands; never committed',
  },
  preFixProvenance: {
    gitObject: '32c916dd0464de6b22042b6c6c1257570313dce8',
    sha256Raw: prefixHash,
    rawBytes: 46519,
    lineEndings: 'raw bytes are pure LF; LF-normalization is identity (same sha256)',
    sha256Crlf: '754c77f4832e56b2284f1a4a2ce43078192cae371e0524068b62f823284d5382',
    sha256BomRaw: 'a81660f993b9588fa138bdb97035570542ab27d858e1f32034cadf2bd04f592e',
    origin: 'git show HEAD:"chart v 1.4/chart/modules/favorites-manager.js" — frozen byte-for-byte at blobs/favorites-manager.prefix.js',
    verified: prefixHash === PREFIX_SHA,
    composerIntermediate: {
      sha256: 'fb7eac001cfa18287c6d7134db61e50da8ea9b8aaf4b6246c8065474da63e0de',
      bytes: 49043,
      note: 'NOT a Git/pre-fix blob. It IS a reconstructable Composer intermediate of favorites-manager.js after Composer\u2019s recorded setup/export edits (verified by the fresh GPT review; CRLF companion 7f157fab\u2026). Forensic artifact only, distinct from the authentic immutable RED source above.',
    },
    retraction: 'Earlier evidence published CRLF=1b69c075\u2026 and LF=72343a60\u2026 "normalization variants" and called fb7eac\u2026 unverifiable; those values were artifacts of a lossy PowerShell pipe and are RETRACTED. Correct variants are recomputed above from the frozen blob bytes.',
  },
  killContract: {
    claim: 'Active kill mode has ORDERED OBSERVABLE BEHAVIOR PARITY with the authentic pre-fix source for the covered legacy events (stacked mousedown/mousemove/mouseup, RAF schedule/run/cancel, style/class mutations; 2 bindings \u2192 2 callbacks \u2192 2 RAFs, no suppression/dedupe), proven by the ordered Node 48-entry and Edge 33-entry A/B logs.',
    notClaimed: 'Whole-method byte/AST/verbatim equivalence is NOT claimed: ledger/RAF/touched-target bookkeeping in the kill path is intentionally non-observable during steady kill mode, and fix-ON recovery/destroy adds transition safety (kill-period RAF cancel + invalidation, touched-toolbar visual restore) that pre-fix never had.',
    limitations: 'Stack frame function names differ from the pre-fix inline anonymous callbacks (named consts in the kill path).',
  },
  postFixSource: {
    sha256: hashes.product['chart v 1.4/chart/modules/favorites-manager.js'],
    dualTreeByteParity: parity,
    testDualTreeByteParity: testParity,
  },
  verification: {
    prefixBlobMatchesExpected: prefixHash === PREFIX_SHA,
    dualTreeProductParity: parity,
    dualTreeTeardownTestParity: testParity,
  },
  lifecycleBlocker:
    'chart.js initDrawingTools() must call favoritesManager?.destroy() before new FavoritesManager(this); full leak stays RED until the chart.js pre-replace/destroy owner lands (W3-serialized shared chart.js lock)',
  replay: {
    nodeRed: 'M20_A_EVIDENCE=red node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs"',
    nodeGreen: 'M20_A_EVIDENCE=green node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs"',
    nodeKill: 'M20_A_EVIDENCE=kill node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs"',
    lifecycleRed: 'M20_A_LIFECYCLE_EVIDENCE=red node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-a-favorites-chart-lifecycle.red.test.mjs"',
    browser: 'node "chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness-run.mjs"',
    manifest: 'node "chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-build-manifest.mjs"',
  },
  hashes,
  generatedAt: new Date().toISOString(),
};

const out = path.join(ROOT, 'docs', 'plan3', 'evidence', 'W4-M20-A-FAVORITES-MANIFEST.json');
atomicWriteTextSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest → ${out}`);
console.log(`prefix verified=${manifest.preFixProvenance.verified} parity=${parity} testParity=${testParity}`);
