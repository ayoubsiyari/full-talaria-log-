/**
 * MIRROR-PARITY-01 — the two copies of a mirrored file must be byte-identical,
 * checked immediately after the edit that touched them.
 *
 * Why immediately, and why bytes. Eleven mirror edits reverted to their
 * committed state between two codemod passes on 2026-08-03. Every file was
 * independently valid, every gate still passed, and no test could see it: a gate
 * reading the canonical copy is unaffected by its mirror being stale. Only a
 * byte comparison of the pair catches that, and only if it runs before the next
 * pass writes over the evidence. The cause was never reproduced, which is the
 * argument for the check rather than against it — it costs a second and it is
 * the sole detector of a whole class.
 *
 * Named refusal states, because "0 diverged" must not be reachable by comparing
 * nothing:
 *   PARITY_OK             pairs were compared and all matched
 *   PARITY_DIVERGED       a pair differs                          (exit 1)
 *   MIRROR_MISSING        one side of a mirrored path is absent   (exit 2)
 *   NO_MIRRORED_EDITS     nothing in a mirrored tree was touched  (exit 0, stated)
 *
 *   node scripts/mirror-parity-check.mjs                # files changed vs HEAD
 *   node scripts/mirror-parity-check.mjs a.mjs b.mjs    # explicit list
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/** Trees that exist twice. Order matters only for reporting. */
export const MIRROR_TREES = [
  ['chart v 1.4/chart/', 'homepage/public/chart/'],
];

export function mirrorPathOf(rel) {
  const norm = rel.replace(/\\/g, '/');
  for (const [a, b] of MIRROR_TREES) {
    if (norm.startsWith(a)) return b + norm.slice(a.length);
    if (norm.startsWith(b)) return a + norm.slice(b.length);
  }
  return null;
}

const sha = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

/**
 * @param {string[]} relPaths repo-relative paths that were just written.
 * @param {{root?: string}} opts root is overridable so the selftest can prove
 *        this reaches PARITY_DIVERGED on a known-divergent pair.
 */
export function checkParity(relPaths, { root = REPO_ROOT } = {}) {
  const diverged = [];
  const missing = [];
  const seen = new Set();
  let checked = 0;

  for (const rel of relPaths) {
    const twin = mirrorPathOf(rel);
    if (!twin) continue;
    // Compare each pair once, whichever side was named.
    const key = [rel, twin].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const a = path.join(root, rel);
    const b = path.join(root, twin);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      missing.push({ rel, twin, absent: fs.existsSync(a) ? twin : rel });
      continue;
    }
    checked += 1;
    const [x, y] = [sha(a), sha(b)];
    if (x !== y) diverged.push({ rel, twin, canonical: x.slice(0, 12), mirror: y.slice(0, 12) });
  }

  const state = diverged.length ? 'PARITY_DIVERGED'
    : missing.length ? 'MIRROR_MISSING'
      : checked === 0 ? 'NO_MIRRORED_EDITS'
        : 'PARITY_OK';
  return { state, checked, diverged, missing };
}

/** For codemods: check, print, and throw rather than returning quietly. */
export function assertParity(relPaths, context = 'edit') {
  const r = checkParity(relPaths);
  report(r, context);
  if (r.state === 'PARITY_DIVERGED') {
    throw new Error(`PARITY_DIVERGED after ${context}: ${r.diverged.map((d) => d.rel).join(', ')}`);
  }
  return r;
}

export function report(r, context = '') {
  const tag = context ? ` (after ${context})` : '';
  for (const d of r.diverged) {
    console.error(`PARITY_DIVERGED ${d.rel}\n   canonical ${d.canonical}  mirror ${d.mirror}`);
  }
  for (const m of r.missing) console.error(`MIRROR_MISSING  ${m.absent} is absent; its twin exists`);
  if (r.state === 'NO_MIRRORED_EDITS') {
    console.log(`[mirror-parity] NO_MIRRORED_EDITS${tag} — nothing in a mirrored tree was touched, so parity was not verified`);
  } else {
    console.log(`[mirror-parity] ${r.state}${tag} — ${r.checked} pair(s) compared, ${r.diverged.length} diverged, ${r.missing.length} half-present`);
  }
}

function changedVsHead() {
  const raw = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const files = args.length ? args : changedVsHead();
  const r = checkParity(files);
  report(r);
  process.exitCode = r.state === 'PARITY_DIVERGED' ? 1 : r.state === 'MIRROR_MISSING' ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
