/**
 * M20-J1 — transplant the J1 hunks from the canonical order-manager.js into
 * the homepage mirror.
 *
 * The two copies were ALREADY divergent at base commit e675e5d1b (the mirror
 * lacks B-W16/B-W18 and carries two older order-line hunks), so a wholesale
 * copy would silently land unrelated changes. This script takes the canonical
 * diff against HEAD, re-points the paths at the mirror, and applies it with
 * `git apply`, which tolerates the ~43-line offset between the trees.
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

const patchPath = path.join(os.tmpdir(), `m20-j1-mirror-${process.pid}.patch`);
fs.writeFileSync(patchPath, repointed, 'utf8');

try {
  git(['apply', '--verbose', '--recount', patchPath], { stdio: 'pipe' });
  console.log('applied J1 hunks to', MIRROR);
} catch (err) {
  console.error('NOT_APPLIED: git apply failed');
  console.error(String(err.stderr || err.message));
  process.exit(1);
} finally {
  fs.rmSync(patchPath, { force: true });
}

const mirrorSrc = fs.readFileSync(path.join(ROOT, MIRROR), 'utf8');
const required = [
  '_m20J1ThumbsEnabled',
  '_m20J1ThumbSrc',
  'showScreenshotPreviewForTrade',
  'expandJournalRenderWindow',
  'data-trade-id=',
  'tradeForAttr',
];
const missing = required.filter((needle) => !mirrorSrc.includes(needle));
if (missing.length) {
  console.error(`NOT_APPLIED: mirror missing after apply: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('mirror verified: all J1 markers present');
