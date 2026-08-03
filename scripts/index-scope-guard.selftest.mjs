/**
 * Cells for INDEX-SCOPE-01.
 *
 * BIND-01: the load-bearing cell is not "does it pass on clean input" — it is
 * that it goes RED on the exact commit that produced the rule. e6f4f6d69 is in
 * this repo's history with the four foreign files still in it, so the defect is
 * available as a fixture rather than a reconstruction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  normalizeRel, covers, scopeCheck, sequencerInProgress, readHookScope, stagedPaths,
} from './index-scope-guard.mjs';
import { parseArgs, verifyCommit, commitFiles } from './commit-scoped.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

test('normalizeRel takes what a shell actually hands over', () => {
  assert.equal(normalizeRel('scripts/a.mjs'), 'scripts/a.mjs');
  assert.equal(normalizeRel('scripts\\a.mjs'), 'scripts/a.mjs');
  assert.equal(normalizeRel('./scripts/a.mjs'), 'scripts/a.mjs');
  assert.equal(normalizeRel('scripts/'), 'scripts');
  assert.equal(normalizeRel(path.join(REPO_ROOT, 'scripts', 'a.mjs')), 'scripts/a.mjs');
  // Outside the repo can never be in scope, and must not become '' (which
  // covers everything) by accident.
  assert.equal(normalizeRel('../elsewhere/a.mjs'), null);
  assert.equal(normalizeRel(''), null);
});

test('a space in the path survives — chart v 1.4 is the tree this protects', () => {
  assert.equal(normalizeRel('chart v 1.4/chart/modules/x.mjs'), 'chart v 1.4/chart/modules/x.mjs');
  assert.ok(covers('chart v 1.4/chart', 'chart v 1.4/chart/modules/x.mjs'));
});

test('covers treats a named directory as covering its contents, not its siblings', () => {
  assert.ok(covers('scripts', 'scripts/a.mjs'));
  assert.ok(covers('scripts/lib', 'scripts/lib/deep/a.mjs'));
  assert.ok(covers('scripts/a.mjs', 'scripts/a.mjs'));
  assert.equal(covers('scripts/lib', 'scripts/libextra/a.mjs'), false);
  assert.equal(covers('scripts/a.mjs', 'scripts/a.mjs.bak'), false);
});

test('naming nothing is not a pass', () => {
  const res = scopeCheck({ staged: ['scripts/a.mjs'], named: [], checkNamedExist: false });
  assert.equal(res.state, 'NOTHING_NAMED');
  assert.equal(res.ok, false);
  assert.deepEqual(res.unnamed, ['scripts/a.mjs']);
});

test('an empty index is nothing to refuse', () => {
  const res = scopeCheck({ staged: [], named: ['scripts/a.mjs'], checkNamedExist: false });
  assert.equal(res.state, 'NOTHING_STAGED');
  assert.equal(res.ok, true);
});

test('scoped index passes', () => {
  const res = scopeCheck({
    staged: ['scripts/a.mjs', 'scripts/lib/b.mjs'],
    named: ['scripts/a.mjs', 'scripts/lib'],
    checkNamedExist: false,
  });
  assert.equal(res.state, 'INDEX_SCOPED');
  assert.equal(res.ok, true);
});

test('RED: the e6f4f6d69 shape — four foreign files carried by the shared index', () => {
  const mine = [
    'scripts/lib/run-lock.mjs',
    'scripts/lib/heap-cycle-browser.mjs',
    'scripts/host-scope-adoption-audit.mjs',
  ];
  const theirs = [
    'docs/plan3/C-BOX-TIME-TO-SEAL-20260803.md',
    'scripts/lib/phase-survival.mjs',
    'scripts/lib/phase-survival.selftest.mjs',
    'scripts/lib/settle-protocol.mjs',
    'scripts/settle-compliance-roster.mjs',
  ];
  const res = scopeCheck({ staged: [...mine, ...theirs], named: mine, checkNamedExist: false });
  assert.equal(res.state, 'INDEX_CARRIES_UNNAMED');
  assert.equal(res.ok, false);
  assert.deepEqual(res.unnamed.sort(), [...theirs].sort());
});

test('RED against the real commit in history, not a reconstruction of it', () => {
  let files;
  try {
    files = commitFiles('e6f4f6d69');
  } catch {
    // The commit must exist for this cell to mean anything. Skipping silently
    // is how a gate scores as present while testing nothing.
    assert.fail('SUBJECT_ABSENT: commit e6f4f6d69 not in this clone');
  }
  assert.ok(files.length > 1, `expected a multi-file commit, got ${files.length}`);
  const foreign = files.filter((f) => /phase-survival|settle-protocol|settle-compliance-roster|C-BOX-TIME-TO-SEAL/.test(f));
  assert.ok(foreign.length >= 4, `expected the four foreign files in e6f4f6d69, saw ${foreign.length}`);

  const named = files.filter((f) => !foreign.includes(f));
  const verdict = verifyCommit(files, named);
  assert.equal(verdict.state, 'COMMIT_CARRIES_UNNAMED');
  assert.deepEqual(verdict.unnamed.sort(), foreign.sort());
});

test('a mistyped name is a refusal, because it widens what it meant to narrow', () => {
  const res = scopeCheck({
    staged: ['scripts/index-scope-guard.mjs'],
    named: ['scripts/index-scope-gaurd.mjs'],
    root: REPO_ROOT,
  });
  assert.equal(res.state, 'NAMED_PATH_ABSENT');
  assert.equal(res.ok, false);
  assert.deepEqual(res.absent, ['scripts/index-scope-gaurd.mjs']);
});

test('naming a path that is staged as a deletion is legitimate', () => {
  const res = scopeCheck({
    staged: ['scripts/deleted-thing.mjs'],
    named: ['scripts/deleted-thing.mjs'],
    root: REPO_ROOT,
  });
  assert.equal(res.state, 'INDEX_SCOPED');
});

test('parseArgs reads -F, -m and paths', () => {
  const a = parseArgs(['-F', 'msg.txt', 'scripts/a.mjs', 'scripts/b.mjs']);
  assert.equal(a.messageFile, 'msg.txt');
  assert.deepEqual(a.paths, ['scripts/a.mjs', 'scripts/b.mjs']);
  const b = parseArgs(['-m', 'hello', '--dry-run', 'scripts/a.mjs']);
  assert.equal(b.message, 'hello');
  assert.equal(b.dryRun, true);
  assert.deepEqual(b.paths, ['scripts/a.mjs']);
});

test('sequencerInProgress exempts a merge and does not exempt an ordinary commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idxscope-seq-'));
  assert.deepEqual(sequencerInProgress(dir), []);
  fs.writeFileSync(path.join(dir, 'MERGE_HEAD'), 'deadbeef\n');
  assert.deepEqual(sequencerInProgress(dir), ['MERGE_HEAD']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a leftover scope file must not bless the next commit', () => {
  // readHookScope reads a file that commit-scoped deletes after use. If it is
  // ever left behind, a later plain `git commit` inherits somebody else's
  // declaration — a stale token reading as a fresh claim, which is the exact
  // false green that cost us a day on b124.
  const src = fs.readFileSync(path.join(__dirname, 'commit-scoped.mjs'), 'utf8');
  assert.match(src, /unlinkSync\(scopeFile\)/, 'commit-scoped must remove .git/COMMIT_SCOPE after committing');
});

test('END TO END: a real repo, a real hook, a real refusal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idxscope-e2e-'));
  const g = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    g(['init', '-q']);
    g(['config', 'user.email', 'cell@example.com']);
    g(['config', 'user.name', 'cell']);
    g(['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(dir, 'mine.txt'), 'mine\n');
    fs.writeFileSync(path.join(dir, 'theirs.txt'), 'theirs\n');
    g(['add', 'mine.txt', 'theirs.txt']);

    // Both staged, one named: this is the defect, and it must be exit 3.
    const refused = spawnSync(process.execPath, [
      path.join(__dirname, 'index-scope-guard.mjs'), '--json', '--root', dir, 'mine.txt',
    ], { cwd: dir, encoding: 'utf8', env: { ...process.env } });
    const parsed = JSON.parse(refused.stdout);
    assert.equal(parsed.state, 'INDEX_CARRIES_UNNAMED', refused.stdout + refused.stderr);
    assert.equal(refused.status, 3, 'a carried foreign file must be exit 3, not a warning');
    assert.ok(parsed.unnamed.includes('theirs.txt'));

    // Naming both is a pass — the guard must not be unconditionally red, or it
    // teaches everyone to bypass it.
    const passed = spawnSync(process.execPath, [
      path.join(__dirname, 'index-scope-guard.mjs'), '--json', '--root', dir, 'mine.txt', 'theirs.txt',
    ], { cwd: dir, encoding: 'utf8' });
    const okParsed = JSON.parse(passed.stdout);
    assert.equal(okParsed.state, 'INDEX_SCOPED', passed.stdout);
    assert.equal(passed.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('END TO END: a staged rename must show the path it removed, not only the one it added', () => {
  // Rename detection reports one path for a rename. That hides the removal —
  // and "another lane's file disappeared" is the shape of the three deletions
  // the one-writer rule was written for. The staged read must see both sides.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idxscope-mv-'));
  const g = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    g(['init', '-q']);
    g(['config', 'user.email', 'cell@example.com']);
    g(['config', 'user.name', 'cell']);
    g(['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(dir, 'theirs.txt'), 'a file with enough content that git calls the move a rename\n'.repeat(4));
    g(['add', 'theirs.txt']);
    g(['commit', '-q', '-m', 'base']);
    g(['mv', 'theirs.txt', 'renamed.txt']);

    const res = spawnSync(process.execPath, [
      path.join(__dirname, 'index-scope-guard.mjs'), '--json', '--root', dir, 'renamed.txt',
    ], { cwd: dir, encoding: 'utf8' });
    const parsed = JSON.parse(res.stdout);
    assert.ok(parsed.staged.includes('theirs.txt'),
      `the removed path must be visible in the index read, saw ${JSON.stringify(parsed.staged)}`);
    assert.equal(parsed.state, 'INDEX_CARRIES_UNNAMED', res.stdout);
    assert.ok(parsed.unnamed.includes('theirs.txt'));
    assert.equal(res.status, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the guard reads this repo without throwing', () => {
  const staged = stagedPaths(REPO_ROOT);
  assert.ok(Array.isArray(staged));
  const scope = readHookScope(REPO_ROOT);
  assert.equal(typeof scope.declared, 'boolean');
});
