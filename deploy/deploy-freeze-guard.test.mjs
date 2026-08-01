/**
 * DEPLOY-FREEZE-V1 — CI check.
 *
 * The guard's only job is to make `check` exit non-zero while a freeze is open. That is one
 * integer, and it is the integer a ship script branches on, so it is asserted directly rather
 * than inferred from the printed banner.
 *
 * Run: node --test deploy/deploy-freeze-guard.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(ROOT, 'deploy', 'deploy-freeze-guard.sh');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-'));
const LOCK = path.join(tmp, 'DEPLOY-FREEZE');
const AUDIT = path.join(tmp, 'DEPLOY-FREEZE.log');

// The guard runs on the Linux canary host, but `bash` on a Windows dev box is usually WSL,
// which cannot open `C:\...`. Translate rather than skip: a gate that quietly no-ops on the
// machine the author is sitting at is a gate the author never actually ran.
const isWsl = spawnSync('bash', ['-c', 'test -d /mnt/c && echo yes'], { encoding: 'utf8' })
    .stdout?.trim() === 'yes';

function toBashPath(p) {
    if (!isWsl) return p;
    const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
    if (!m) return p.split('\\').join('/');
    return `/mnt/${m[1].toLowerCase()}/${m[2].split('\\').join('/')}`;
}

const shq = (s) => `'${String(s).split("'").join(`'\\''`)}'`;

/**
 * Run the guard with the lock redirected into a temp dir.
 *
 * The environment is set inside the bash command line rather than via spawn's `env`, because
 * WSL does not forward arbitrary Windows environment variables without WSLENV — which silently
 * left the guard writing to the real /opt/talaria lock instead of the temp one.
 */
function guard(args, extraEnv = {}) {
    const assignments = Object.entries({
        TALARIA_FREEZE_LOCK: toBashPath(LOCK),
        TALARIA_FREEZE_AUDIT: toBashPath(AUDIT),
        ...extraEnv,
    }).map(([k, v]) => `${k}=${shq(v)}`).join(' ');
    const cmd = `${assignments} bash ${shq(toBashPath(GUARD))} ${args.map(shq).join(' ')}`;
    return spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
}

const bashOk = spawnSync('bash', ['-c', 'exit 0']).status === 0;

test('CELL 0 — bash is available, so these cells are not silently vacuous', () => {
    assert.equal(bashOk, true, 'no bash: this gate cannot verify the guard on this machine');
    // Prove the translated path actually reaches the script, so a later exit code of 127
    // ("not found") can never be mistaken for the exit code 1 that means "frozen".
    const r = guard(['status']);
    assert.notEqual(r.status, 127,
        `bash cannot see the guard at ${toBashPath(GUARD)}: ${r.stderr}`);
});

test('CELL 1 — check passes when no freeze is armed', () => {
    const r = guard(['check']);
    assert.equal(r.status, 0, r.stderr);
});

test('CELL 2 — arm creates the lock and records who and why', () => {
    const r = guard(['arm', 'manager-B', 'PO test window on b115']);
    assert.equal(r.status, 0, r.stderr);
    const body = fs.readFileSync(LOCK, 'utf8');
    assert.match(body, /armed_by: manager-B/);
    assert.match(body, /PO test window on b115/);
    assert.match(body, /expiry:\s+none/, 'the freeze must not silently expire mid-test');
});

test('CELL 3 — check FAILS while the freeze is armed', () => {
    // The whole control is this exit code.
    const r = guard(['check']);
    assert.equal(r.status, 1, 'a ship must not proceed during a freeze');
    assert.match(r.stderr, /REFUSING TO DEPLOY/);
});

test('CELL 4 — arming twice is refused rather than silently overwriting', () => {
    const r = guard(['arm', 'someone-else', 'unrelated reason']);
    assert.equal(r.status, 1);
    assert.match(fs.readFileSync(LOCK, 'utf8'), /armed_by: manager-B/,
        'the original freeze must survive');
});

test('CELL 5 — override is allowed, loud, and audited', () => {
    const r = guard(['check'], { TALARIA_FREEZE_OVERRIDE: 'P0 hotfix, PO notified' });
    assert.equal(r.status, 0, 'an override that cannot work gets bypassed by not calling the guard');
    assert.match(r.stdout, /DEPLOY FREEZE OVERRIDDEN/);
    assert.match(fs.readFileSync(AUDIT, 'utf8'), /OVERRIDE\tP0 hotfix, PO notified/,
        'a silent override is the failure mode; it has to leave a trace');
});

test('CELL 6 — lift clears the freeze and check passes again', () => {
    const lifted = guard(['lift', 'manager-D', 'PO window closed']);
    assert.equal(lifted.status, 0, lifted.stderr);
    assert.equal(fs.existsSync(LOCK), false);
    assert.equal(guard(['check']).status, 0);
    assert.match(fs.readFileSync(AUDIT, 'utf8'), /LIFTED\tmanager-D\tPO window closed/);
});

test('CELL 7 — MUTANT: a lock file that exists but is empty still blocks', () => {
    // Fail closed. A truncated or half-written lock is still a freeze.
    fs.writeFileSync(LOCK, '');
    assert.equal(guard(['check']).status, 1, 'presence of the lock is the signal, not its contents');
    fs.rmSync(LOCK);
});

test('CELL 8 — status never fails, so it is safe in a prompt or banner', () => {
    assert.equal(guard(['status']).status, 0);
    guard(['arm', 'manager-B', 'again']);
    assert.equal(guard(['status']).status, 0);
    guard(['lift', 'manager-B', 'cleanup']);
});
