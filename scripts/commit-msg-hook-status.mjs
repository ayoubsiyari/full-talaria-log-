#!/usr/bin/env node
/**
 * TERRITORY-HOOK-01 binding check and installer.
 *
 * This repository already owns a finding titled "we have four release hooks and all
 * four switch themselves off when cached". A hook that exists in the tree but is not
 * installed in .git/hooks is the same class of lie: present, unbound, and reported as
 * protection. So the states are named separately and none of them is inferred from the
 * source file's existence:
 *
 *   HOOK_ABSENT_FROM_TREE   scripts/hooks/commit-msg is not in the checkout
 *   HOOK_NOT_INSTALLED      it is in the tree but .git/hooks/commit-msg is not there
 *   HOOK_INSTALLED_STALE    installed, but its bytes differ from the tree's
 *   HOOK_INACTIVE_NO_LANE   installed and current, but TALARIA_MANAGER is unset here,
 *                           so the next commit will be REFUSED rather than attributed
 *   HOOK_ACTIVE             installed, current, and a lane is set
 *
 *   node scripts/commit-msg-hook-status.mjs            # report, exit 0 only when ACTIVE
 *   node scripts/commit-msg-hook-status.mjs --install  # copy it into .git/hooks
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'scripts/hooks/commit-msg';

export const HOOK_EXIT = Object.freeze({
  HOOK_ACTIVE: 0,
  HOOK_INACTIVE_NO_LANE: 1,
  HOOK_INSTALLED_STALE: 2,
  HOOK_NOT_INSTALLED: 3,
  HOOK_ABSENT_FROM_TREE: 4,
});

function gitDir(root) {
  try {
    const out = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function hooksPath(root) {
  // core.hooksPath redirects hooks elsewhere, and a hook installed into .git/hooks
  // while hooksPath points at another directory is installed where git will never look.
  // Reporting ACTIVE in that case would be precisely the false green this checks for.
  try {
    const configured = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (configured) return { dir: path.resolve(root, configured), redirected: true };
  } catch { /* unset is the normal case */ }
  const git = gitDir(root);
  return git ? { dir: path.join(git, 'hooks'), redirected: false } : { dir: null, redirected: false };
}

export function hookStatus({ root = repoRoot, env = process.env } = {}) {
  const sourceAbs = path.join(root, SOURCE);
  const { dir, redirected } = hooksPath(root);
  const targetAbs = dir ? path.join(dir, 'commit-msg') : null;
  const lane = env.TALARIA_MANAGER || null;
  const base = { source: SOURCE, target: targetAbs, hooksPathRedirected: redirected, lane };

  if (!fs.existsSync(sourceAbs)) return { ...base, state: 'HOOK_ABSENT_FROM_TREE' };
  if (!targetAbs || !fs.existsSync(targetAbs)) return { ...base, state: 'HOOK_NOT_INSTALLED' };

  const want = fs.readFileSync(sourceAbs, 'utf8');
  const have = fs.readFileSync(targetAbs, 'utf8');
  if (want !== have) return { ...base, state: 'HOOK_INSTALLED_STALE' };
  if (!lane) return { ...base, state: 'HOOK_INACTIVE_NO_LANE' };
  if (!/^(?:Director|[A-E])$/.test(lane)) {
    return { ...base, state: 'HOOK_INACTIVE_NO_LANE', why: `TALARIA_MANAGER=${lane} is not a valid lane` };
  }
  return { ...base, state: 'HOOK_ACTIVE' };
}

const ADVICE = {
  HOOK_ABSENT_FROM_TREE: 'The hook source is missing from the checkout. Nothing to install.',
  HOOK_NOT_INSTALLED: 'Install it: node scripts/commit-msg-hook-status.mjs --install',
  HOOK_INSTALLED_STALE: 'The installed copy has drifted from the tree. Re-install to match.',
  HOOK_INACTIVE_NO_LANE: 'Set your lane, or the next commit is REFUSED: $env:TALARIA_MANAGER = \'B\'',
  HOOK_ACTIVE: 'Every commit from this worktree will carry a Manager: trailer.',
};

function install(root) {
  const { dir, redirected } = hooksPath(root);
  if (!dir) {
    console.error('[commit-msg-hook] REFUSED: this is not a git worktree');
    return 4;
  }
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'commit-msg');
  fs.copyFileSync(path.join(root, SOURCE), target);
  try { fs.chmodSync(target, 0o755); } catch { /* windows filesystems have no bit to set */ }
  console.log(`[commit-msg-hook] installed to ${target}`);
  if (redirected) console.log('  (core.hooksPath is set, so this went to the configured directory)');
  console.log('  This file is NOT version controlled. Every worktree installs it once,');
  console.log('  and scripts/commit-msg-hook-status.mjs is how you find out whether yours has.');
  return 0;
}

function main() {
  if (process.argv.includes('--install')) return install(repoRoot);
  const status = hookStatus();
  console.log(`[commit-msg-hook] ${status.state}`);
  console.log(`  source  ${status.source}`);
  console.log(`  target  ${status.target || '(no git dir)'}`);
  console.log(`  lane    ${status.lane || '(TALARIA_MANAGER unset)'}`);
  if (status.why) console.log(`  why     ${status.why}`);
  console.log(`  ${ADVICE[status.state]}`);
  return HOOK_EXIT[status.state];
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = main();
