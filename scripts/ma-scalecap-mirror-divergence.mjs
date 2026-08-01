/**
 * MA-SCALECAP — report the canonical/mirror divergence for order-manager.js as
 * an insertion/deletion count, so "unchanged divergence" is a measured claim
 * rather than an assertion.
 *
 *   node scripts/ma-scalecap-mirror-divergence.mjs            # working tree
 *   node scripts/ma-scalecap-mirror-divergence.mjs 79625eac6  # a commit
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'chart v 1.4/chart/modules/order-manager.js';
const MIRROR = 'homepage/public/chart/modules/order-manager.js';
const rev = process.argv[2] || null;

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts,
  });
}

function read(rel) {
  if (!rev) return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return git(['show', `${rev}:${rel}`]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-scalecap-div-'));
const a = path.join(tmp, 'canonical.js');
const b = path.join(tmp, 'mirror.js');
fs.writeFileSync(a, read(CANONICAL));
fs.writeFileSync(b, read(MIRROR));

let stat = '';
try {
  stat = git(['diff', '--no-index', '--numstat', '--', a, b]);
} catch (err) {
  // git diff --no-index exits 1 when the files differ; that is not an error.
  stat = String(err.stdout || '');
}
fs.rmSync(tmp, { recursive: true, force: true });

const line = stat.trim().split('\n').filter(Boolean)[0];
const [ins, del] = line ? line.split('\t') : ['0', '0'];
console.log(JSON.stringify({
  rev: rev || 'WORKING_TREE',
  insertions: Number(ins) || 0,
  deletions: Number(del) || 0,
  identical: !line,
}));
