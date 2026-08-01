/**
 * MA-SCALECAP — transplant the scale-in entry-cap hunks from the canonical
 * order-manager.js into the homepage mirror.
 *
 * A targeted diff transplant rather than a wholesale copy: whatever divergence
 * exists between the two trees at the current base is not this change's to
 * alter, and `git apply` tolerates line offsets between them. At base
 * 79625eac6 the two copies happen to be byte-identical (verify with
 * `ma-scalecap-mirror-divergence.mjs`), but a copy would still be the wrong
 * tool — it would silently launder any future divergence into this commit.
 *
 * Refuses loudly rather than half-applying.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'chart v 1.4/chart/modules/order-manager.js';
const MIRROR = 'homepage/public/chart/modules/order-manager.js';

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    ...opts,
  });
}

const diff = git(['diff', '-U8', '--', CANONICAL]);
if (!diff.trim()) {
  console.error('NOT_APPLIED: canonical order-manager.js has no uncommitted diff');
  process.exit(1);
}

const repointed = diff
  .split('\n')
  .map((line) => {
    if (line.startsWith('diff --git ')) return `diff --git a/${MIRROR} b/${MIRROR}`;
    if (line.startsWith('--- a/')) return `--- a/${MIRROR}`;
    if (line.startsWith('+++ b/')) return `+++ b/${MIRROR}`;
    if (line.startsWith('index ')) return null; // blob ids do not match the mirror
    return line;
  })
  .filter((l) => l !== null)
  .join('\n');

const patchPath = path.join(os.tmpdir(), `ma-scalecap-mirror-${process.pid}.patch`);
fs.writeFileSync(patchPath, repointed, 'utf8');

try {
  git(['apply', '--verbose', '--recount', patchPath], { stdio: 'pipe' });
  console.log('applied MA-SCALECAP hunks to', MIRROR);
} catch (err) {
  console.error('NOT_APPLIED: git apply failed');
  console.error(String(err.stderr || err.message));
  process.exit(1);
} finally {
  fs.rmSync(patchPath, { force: true });
}

const mirrorSrc = fs.readFileSync(path.join(ROOT, MIRROR), 'utf8');
const required = [
  '_scaleInEntryCapV1Enabled',
  '__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1',
  'existingGroupForCap',
  'stays a standalone position',
];
const missing = required.filter((needle) => !mirrorSrc.includes(needle));
if (missing.length) {
  console.error(`NOT_APPLIED: mirror missing after apply: ${missing.join(', ')}`);
  process.exit(1);
}

// Every marker must land EXACTLY as often as it does in the canonical copy —
// a doubled hunk is as wrong as a missing one.
const canonicalSrc = fs.readFileSync(path.join(ROOT, CANONICAL), 'utf8');
const countOf = (hay, needle) => hay.split(needle).length - 1;
const skew = required
  .map((needle) => ({ needle, c: countOf(canonicalSrc, needle), m: countOf(mirrorSrc, needle) }))
  .filter((r) => r.c !== r.m);
if (skew.length) {
  console.error(`NOT_APPLIED: marker count skew: ${skew.map((r) => `${r.needle} canonical=${r.c} mirror=${r.m}`).join('; ')}`);
  process.exit(1);
}
console.log('mirror verified: all MA-SCALECAP markers present at canonical multiplicity');
