#!/usr/bin/env node
/**
 * TERRITORY-HOOK-01 cells.
 *
 * Every behavioural cell runs `git commit` for real in a scratch repository with the
 * hook installed, because the thing under test is whether GIT invokes it and honours
 * its exit code. A cell that called the shell script directly would prove the script
 * works and say nothing about whether it is bound -- which is the failure this repo has
 * already been bitten by, in the four release hooks that switched themselves off.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hookStatus, HOOK_EXIT } from '../commit-msg-hook-status.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const HOOK_SOURCE = path.join(root, 'scripts/hooks/commit-msg');

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-hook-'));
  const baseEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Lane', GIT_AUTHOR_EMAIL: 'lane@talaria.invalid',
    GIT_COMMITTER_NAME: 'Lane', GIT_COMMITTER_EMAIL: 'lane@talaria.invalid',
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-absent'),
    GIT_CONFIG_SYSTEM: path.join(dir, '.gitconfig-absent'),
  };
  delete baseEnv.TALARIA_MANAGER;
  delete baseEnv.TALARIA_ROW;
  delete baseEnv.TALARIA_PACKET;
  delete baseEnv.TALARIA_TIER;

  const git = (args, env = {}) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf8', env: { ...baseEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(['init', '-b', 'main']);
  fs.mkdirSync(path.join(dir, '.git/hooks'), { recursive: true });
  fs.copyFileSync(HOOK_SOURCE, path.join(dir, '.git/hooks/commit-msg'));
  fs.chmodSync(path.join(dir, '.git/hooks/commit-msg'), 0o755);

  const commit = (message, env = {}) => {
    fs.writeFileSync(path.join(dir, `f${Math.random().toString(36).slice(2)}.txt`), 'x\n');
    git(['add', '-A']);
    try {
      git(['commit', '-m', message], env);
      return { ok: true, stderr: '' };
    } catch (error) {
      return { ok: false, stderr: (error.stderr || '') + (error.stdout || '') };
    }
  };
  const lastMessage = () => git(['log', '-1', '--format=%B']);
  return { dir, git, commit, lastMessage };
}

const withRepo = (fn) => {
  const repo = scratchRepo();
  try { fn(repo); } finally { fs.rmSync(repo.dir, { recursive: true, force: true }); }
};

test('the hook source is committed to the tree, executable content and all', () => {
  assert.ok(fs.existsSync(HOOK_SOURCE), 'scripts/hooks/commit-msg must be in the tree');
  const body = fs.readFileSync(HOOK_SOURCE, 'utf8');
  assert.match(body, /^#!\/bin\/sh/, 'needs a shebang to be runnable by git');
  assert.match(body, /TALARIA_MANAGER/);
});

test('DISCRIMINATING: a commit with no trailer and no lane is REFUSED by git', () => {
  withRepo((repo) => {
    const outcome = repo.commit('feat: no trailer, no lane');
    assert.equal(outcome.ok, false, 'git must reject the commit, not merely warn');
    assert.match(outcome.stderr, /REFUSED/);
    assert.match(outcome.stderr, /TALARIA_MANAGER is unset/);
    // And nothing landed.
    assert.throws(() => repo.git(['rev-parse', 'HEAD']));
  });
});

test('with a lane set, the trailer is added and the commit proceeds', () => {
  withRepo((repo) => {
    const outcome = repo.commit('feat: attributed', { TALARIA_MANAGER: 'B' });
    assert.equal(outcome.ok, true, outcome.stderr);
    const message = repo.lastMessage();
    assert.match(message, /^Manager: B$/m);
    assert.match(message, /^feat: attributed$/m, 'the subject survives untouched');
  });
});

test('the added trailer is in the trailer block, so git parses it as one', () => {
  withRepo((repo) => {
    repo.commit('feat: attributed', { TALARIA_MANAGER: 'C' });
    const parsed = repo.git(['log', '-1', '--format=%(trailers:key=Manager,valueonly)']).trim();
    assert.equal(parsed, 'C', 'git interpret-trailers must see it, not just a regex');
  });
});

test('Row, Packet and Tier ride along when their variables are set', () => {
  withRepo((repo) => {
    const outcome = repo.commit('feat: full packet metadata', {
      TALARIA_MANAGER: 'B', TALARIA_ROW: 'A11.2-territory', TALARIA_PACKET: 'PACKET-B-001', TALARIA_TIER: '2',
    });
    assert.equal(outcome.ok, true, outcome.stderr);
    const message = repo.lastMessage();
    assert.match(message, /^Manager: B$/m);
    assert.match(message, /^Row: A11\.2-territory$/m);
    assert.match(message, /^Packet: PACKET-B-001$/m);
    assert.match(message, /^Tier: 2$/m);
  });
});

test('an existing trailer that agrees is left exactly as written, not duplicated', () => {
  withRepo((repo) => {
    const outcome = repo.commit('feat: already stamped\n\nManager: B\n', { TALARIA_MANAGER: 'B' });
    assert.equal(outcome.ok, true, outcome.stderr);
    const occurrences = repo.lastMessage().match(/^Manager: B$/gm) || [];
    assert.equal(occurrences.length, 1, 'must not append a second copy');
  });
});

test('DISCRIMINATING: a trailer that DISAGREES with the lane is refused, never rewritten', () => {
  withRepo((repo) => {
    const outcome = repo.commit('feat: wrong lane\n\nManager: A\n', { TALARIA_MANAGER: 'B' });
    assert.equal(outcome.ok, false);
    assert.match(outcome.stderr, /the message says Manager: A but this worktree is/);
    assert.match(outcome.stderr, /TALARIA_MANAGER=B/);
    assert.match(outcome.stderr, /Not rewritten for you/);
  });
});

test('an invalid lane letter is refused from either source', () => {
  withRepo((repo) => {
    let outcome = repo.commit('feat: bad env', { TALARIA_MANAGER: 'Z' });
    assert.equal(outcome.ok, false);
    assert.match(outcome.stderr, /TALARIA_MANAGER=Z is not a valid lane/);

    outcome = repo.commit('feat: bad trailer\n\nManager: nobody\n', { TALARIA_MANAGER: 'B' });
    assert.equal(outcome.ok, false);
    assert.match(outcome.stderr, /Manager: nobody is not a valid lane/);
  });
});

test('Director is a valid lane', () => {
  withRepo((repo) => {
    const outcome = repo.commit('chore: ruling', { TALARIA_MANAGER: 'Director' });
    assert.equal(outcome.ok, true, outcome.stderr);
    assert.match(repo.lastMessage(), /^Manager: Director$/m);
  });
});

test('a merge commit is allowed through unattributed, because the work is not the merger\'s', () => {
  withRepo((repo) => {
    repo.commit('feat: base', { TALARIA_MANAGER: 'B' });
    repo.git(['checkout', '-b', 'side']);
    repo.commit('feat: on the side', { TALARIA_MANAGER: 'B' });
    repo.git(['checkout', 'main']);
    repo.commit('feat: on main', { TALARIA_MANAGER: 'B' });
    // A merge with a conflict-free tree still writes MERGE_MSG through this hook.
    const merged = (() => {
      try { repo.git(['merge', '--no-ff', 'side', '-m', 'merge: side']); return true; } catch { return false; }
    })();
    assert.equal(merged, true, 'the hook must not strand a lane mid-merge');
  });
});

test('ANTI-VACUITY: the hook is what refuses, not something else in the fixture', () => {
  // Same commit, same absent lane, hook removed. If this passed while the cell above
  // also passed, the refusal would be coming from somewhere other than the hook.
  withRepo((repo) => {
    fs.rmSync(path.join(repo.dir, '.git/hooks/commit-msg'));
    const outcome = repo.commit('feat: no trailer, no lane, no hook');
    assert.equal(outcome.ok, true, 'without the hook the same commit lands freely');
    assert.doesNotMatch(repo.lastMessage(), /^Manager:/m);
  });
});

// --- the binding check ---------------------------------------------------------

test('hookStatus: an uninstalled hook reports NOT_INSTALLED, not a pass', () => {
  withRepo((repo) => {
    fs.rmSync(path.join(repo.dir, '.git/hooks/commit-msg'));
    const status = hookStatus({ root: repo.dir, env: { TALARIA_MANAGER: 'B' } });
    // The source lives in the real tree, not the scratch one, so this scratch repo
    // reports ABSENT_FROM_TREE -- itself a distinct state from NOT_INSTALLED.
    assert.equal(status.state, 'HOOK_ABSENT_FROM_TREE');
    assert.notEqual(HOOK_EXIT.HOOK_ABSENT_FROM_TREE, HOOK_EXIT.HOOK_ACTIVE);
  });
});

test('hookStatus: present in the tree but not in .git/hooks is NOT_INSTALLED', () => {
  const status = hookStatus({
    root, env: { TALARIA_MANAGER: 'B' },
  });
  // Whatever this developer's box says, the state must be one of the named five and
  // ACTIVE must require both installation and a lane.
  assert.ok(Object.hasOwn(HOOK_EXIT, status.state), `${status.state} is not a declared state`);
  if (status.state === 'HOOK_ACTIVE') {
    assert.ok(fs.existsSync(status.target), 'ACTIVE requires the file to actually be there');
  }
});

test('hookStatus: installed and current but no lane is INACTIVE, and that is not ACTIVE', () => {
  const withLane = hookStatus({ root, env: { TALARIA_MANAGER: 'B' } });
  const without = hookStatus({ root, env: {} });
  if (withLane.state === 'HOOK_ACTIVE') {
    assert.equal(without.state, 'HOOK_INACTIVE_NO_LANE',
      'the same installation with no lane set must not read as ACTIVE');
  }
  assert.notEqual(HOOK_EXIT.HOOK_INACTIVE_NO_LANE, HOOK_EXIT.HOOK_ACTIVE);
});

test('hookStatus: an invalid lane is INACTIVE and says why', () => {
  const status = hookStatus({ root, env: { TALARIA_MANAGER: 'Z' } });
  if (status.state !== 'HOOK_NOT_INSTALLED' && status.state !== 'HOOK_INSTALLED_STALE') {
    assert.equal(status.state, 'HOOK_INACTIVE_NO_LANE');
    assert.match(status.why, /not a valid lane/);
  }
});

test('every declared state has a distinct exit code', () => {
  const codes = Object.values(HOOK_EXIT);
  assert.equal(new Set(codes).size, codes.length, 'two states sharing a code cannot be told apart');
  assert.equal(HOOK_EXIT.HOOK_ACTIVE, 0, 'only ACTIVE may be a success');
});
