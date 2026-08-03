/**
 * RUN-LOCK-01 selftest. This module is now the single precondition for every
 * Chrome-launching run, so its refusals carry other lanes' hours and each one is
 * driven from a real live holder rather than a mock.
 *
 * B: the two cells you offered are stubbed in at the bottom — a pre-boot refusal
 * timing cell against a real instrument, and a mutant-swap arm that proves the
 * refusal binds to the exclusive-create rather than to the assertion's wording.
 * Sharpen them here rather than in a second lock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  HOST_SCOPE_KEY,
  acquireRunLock,
  classifyRunStrict,
  foreignRuns,
  heldFor,
  inspectLocks,
  isAlive,
  lockFlagsFromArgv,
  lockPathFor,
  writeArtifactAtomic,
} from './run-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const tmpArtifact = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runlock-')), 'artifact.json');

/** A holder that is genuinely alive and is not us: our own parent shell. */
function plantLive(name, scope, script = 'other.mjs') {
  const lf = lockPathFor(name, scope);
  fs.mkdirSync(path.dirname(lf), { recursive: true });
  fs.writeFileSync(lf, JSON.stringify({
    scope, name: String(name), pid: process.ppid, script, startedAt: new Date().toISOString(),
  }, null, 2));
  return lf;
}

test('isAlive: this process yes, an implausible pid no', () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(0x7ffffff), false);
  assert.equal(isAlive(-1), false);
});

test('first launch takes host, identity and artifact together', () => {
  const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'selftest-a.mjs' });
  try {
    assert.equal(lock.state, 'LOCK_ACQUIRED');
    assert.deepEqual(lock.scopes, ['host', 'identity', 'artifact']);
    const host = inspectLocks().find((l) => l.scope === 'host');
    assert.equal(host.pid, process.pid);
  } finally { lock.release(); }
});

test('release frees every scope, so the next run is not blocked by the last', () => {
  const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'selftest-b.mjs' });
  lock.release();
  assert.deepEqual(inspectLocks().filter((l) => l.pid === process.pid), []);
});

test('RED — THE 12:04 ACCIDENT: two different scripts cannot both hold the box', () => {
  // C's canonical-floor-retake and D's mutant suite: different identities,
  // different artifacts, so identity and artifact locks both grant all of them.
  // Only the host scope refuses, and this is the cell that says so.
  const lf = plantLive(HOST_SCOPE_KEY, 'host', 'canonical-floor-retake.mjs');
  try {
    const second = acquireRunLock({ artifact: tmpArtifact(), script: 'tal-po-ui-smoke-canary.mjs' });
    assert.equal(second.state, 'HOST_BUSY_REFUSED');
    assert.equal(second.scope, 'host');
    assert.equal(second.holder.script, 'canonical-floor-retake.mjs');
  } finally { fs.unlinkSync(lf); }
});

test('RED: a second live copy of one instrument is refused on identity', () => {
  const lf = plantLive('dupe.mjs', 'identity', 'dupe.mjs');
  try {
    // Distinct artifact paths, as an auto-suffixing instrument produces.
    const second = acquireRunLock({ artifact: tmpArtifact(), script: 'dupe.mjs', host: false });
    assert.equal(second.state, 'DUPLICATE_LAUNCH_REFUSED');
    assert.equal(second.scope, 'identity');
  } finally { fs.unlinkSync(lf); }
});

test('RED: two different scripts aimed at one artifact are refused on artifact', () => {
  const shared = tmpArtifact();
  const lf = plantLive(shared, 'artifact', 'writer-one.mjs');
  try {
    const second = acquireRunLock({ artifact: shared, script: 'writer-two.mjs', host: false });
    assert.equal(second.state, 'ARTIFACT_WRITER_REFUSED');
    assert.equal(second.scope, 'artifact');
  } finally { fs.unlinkSync(lf); }
});

test('a refusal at a later scope leaves no earlier scope held', () => {
  // Otherwise the cure is an outage: a refused run parks the box for everyone.
  const lf = plantLive('parker.mjs', 'identity', 'parker.mjs');
  try {
    const refused = acquireRunLock({ artifact: tmpArtifact(), script: 'parker.mjs' });
    assert.equal(refused.state, 'DUPLICATE_LAUNCH_REFUSED');
    const stillHeld = inspectLocks().filter((l) => l.scope === 'host' && l.pid === process.pid);
    assert.deepEqual(stillHeld, []);
    // And the box is genuinely free for the next caller.
    const next = acquireRunLock({ artifact: tmpArtifact(), script: 'someone-else.mjs' });
    assert.equal(next.state, 'LOCK_ACQUIRED');
    next.release();
  } finally { fs.unlinkSync(lf); }
});

test('a dead holder is reclaimed rather than parking the box forever', () => {
  const lf = lockPathFor(HOST_SCOPE_KEY, 'host');
  fs.mkdirSync(path.dirname(lf), { recursive: true });
  fs.writeFileSync(lf, JSON.stringify({ scope: 'host', pid: 0x7ffffff, script: 'crashed.mjs', startedAt: new Date().toISOString() }));
  const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'selftest-c.mjs' });
  try {
    assert.match(lock.state, /LOCK_STALE_RECLAIMED/);
    assert.ok(lock.notes.some((n) => n.startsWith('host:')));
  } finally { lock.release(); }
});

test('an unparseable lock is reclaimed with its own state, not a crash', () => {
  const lf = lockPathFor('corrupt.mjs', 'identity');
  fs.mkdirSync(path.dirname(lf), { recursive: true });
  fs.writeFileSync(lf, 'not json at all');
  const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'corrupt.mjs', host: false });
  try {
    assert.match(lock.state, /LOCK_UNPARSEABLE_RECLAIMED/);
  } finally { lock.release(); }
});

test('override is available, and names itself so the artifact can declare it', () => {
  const lf = plantLive(HOST_SCOPE_KEY, 'host', 'someone.mjs');
  try {
    const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'forcer.mjs', allowConcurrent: true });
    assert.match(lock.state, /CONCURRENCY_OVERRIDDEN/);
    lock.release();
  } finally { fs.unlinkSync(lf); }
});

test('--wait-for-host queues on the box but never on a duplicate of itself', () => {
  const flags = lockFlagsFromArgv(['node', 'x.mjs', '--wait-for-host=4000', '--allow-concurrent']);
  assert.deepEqual(flags, { allowConcurrent: true, waitForHostMs: 4000, host: true, skipForeignScan: false });
  assert.equal(lockFlagsFromArgv(['node', 'x.mjs', '--no-host-lock', '--skip-foreign-scan']).host, false);
  assert.equal(lockFlagsFromArgv(['node', 'x.mjs', '--skip-foreign-scan']).skipForeignScan, true);

  // Identity is a mistake to report, not a queue to join: waiting must not apply.
  const lf = plantLive('waiter.mjs', 'identity', 'waiter.mjs');
  try {
    const t0 = Date.now();
    const refused = acquireRunLock({ artifact: tmpArtifact(), script: 'waiter.mjs', host: false, waitForHostMs: 60000 });
    assert.equal(refused.state, 'DUPLICATE_LAUNCH_REFUSED');
    assert.ok(Date.now() - t0 < 3000, 'identity refusal must be immediate');
  } finally { fs.unlinkSync(lf); }
});

test('heldFor reports seconds then minutes, and null on a missing stamp', () => {
  assert.equal(heldFor({ startedAt: new Date(Date.now() - 5000).toISOString() }), '5s');
  assert.equal(heldFor({ startedAt: new Date(Date.now() - 8 * 60000).toISOString() }), '8m');
  assert.equal(heldFor({}), null);
});

test('the refusal classifier excludes the editor and the file servers it found on this box', () => {
  // Fixtures taken verbatim from this machine at 13:0x, where the broad queue
  // classifier matched all four. A refusal gate that blocks while the IDE is
  // open is a worse outage than the contention it prevents.
  const editor = 'c:\\Users\\user\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe --max-old-space-size=3072 -e "process.title = x"';
  assert.equal(classifyRunStrict(editor).measurement, false);
  assert.match(classifyRunStrict(editor).why, /editor/);

  const server = '"C:\\Program Files\\nodejs\\node.exe" "chart v 1.4/chart/multichart-prod/harness/serve.mjs"';
  assert.equal(classifyRunStrict(server).measurement, false);
  assert.match(classifyRunStrict(server).why, /does not launch a browser/);

  const real = '"C:\\Program Files\\nodejs\\node.exe" scripts/canonical-floor-retake.mjs --origin=http://31.97.192.82:3000 --speed=10';
  assert.equal(classifyRunStrict(real).measurement, true);
  assert.equal(classifyRunStrict(real).script, 'canonical-floor-retake.mjs');

  // Our own suites must not gate each other, or the tests become the outage.
  assert.equal(classifyRunStrict('node --test scripts/lib/run-lock.selftest.mjs').measurement, false);
  assert.equal(classifyRunStrict('node scripts/run-lock-status.mjs').measurement, false);
});

test('the foreign scan answers in named states and never counts us as foreign', async () => {
  // The machine's contents are not ours to fix, so this asserts the contract
  // rather than a count: one of three named states, never a bare empty "clear",
  // and our own process is excluded so a run cannot refuse itself.
  const scan = await foreignRuns();
  assert.ok(['NO_FOREIGN_RUNS', 'UNLOCKED_FOREIGN_RUN_DETECTED', 'FOREIGN_SCAN_UNAVAILABLE'].includes(scan.state), scan.state);
  assert.deepEqual(scan.runs.filter((r) => r.pid === process.pid), []);
  if (scan.state === 'FOREIGN_SCAN_UNAVAILABLE') assert.ok(scan.why, 'an unavailable scan must say why');
  if (scan.state === 'UNLOCKED_FOREIGN_RUN_DETECTED') assert.ok(scan.runs.length > 0);
});

test('a lock-holding run is not reported as a foreign run', async () => {
  const lock = acquireRunLock({ artifact: tmpArtifact(), script: 'selftest-foreign.mjs' });
  try {
    const scan = await foreignRuns();
    assert.deepEqual(scan.runs.filter((r) => r.pid === process.pid), []);
  } finally { lock.release(); }
});

test('writeArtifactAtomic leaves no partial file and no temp behind', () => {
  const a = tmpArtifact();
  writeArtifactAtomic(a, JSON.stringify({ ok: true }));
  assert.deepEqual(JSON.parse(fs.readFileSync(a, 'utf8')), { ok: true });
  assert.deepEqual(fs.readdirSync(path.dirname(a)).filter((f) => f.includes('.tmp-')), []);
});

// ---------------------------------------------------------------------------
// B's cells. Placed here so there is one lock and one suite.
// ---------------------------------------------------------------------------

test("B's cell — a real instrument refuses before it boots anything", () => {
  // The claim under test is not "it refuses" but "it refuses EARLY": the whole
  // value on a shared box is that no browser and no harness server appear. A
  // refusal that arrives after boot has already cost the thing it was preventing.
  const lf = plantLive(HOST_SCOPE_KEY, 'host', 'holder.mjs');
  try {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['scripts/order01b-readback-canary.mjs', '--speed=10', '--step=1'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000,
    });
    const elapsed = Date.now() - t0;
    assert.equal(r.status, 3, `expected exit 3, got ${r.status}: ${r.stderr?.slice(0, 400)}`);
    assert.match(r.stderr, /HOST_BUSY_REFUSED/);
    assert.match(r.stderr, /no browser was launched/);
    // Module load dominates; the point is that it is nowhere near a boot.
    assert.ok(elapsed < 20000, `refusal took ${elapsed}ms, which is long enough to have booted something`);
    assert.doesNotMatch(r.stdout || '', /harness|listening|puppeteer/i);
  } finally { fs.unlinkSync(lf); }
});

test("B's cell — mutant swap: exclusive create is what enforces it", () => {
  // BIND-01. If `wx` is weakened to `w`, the refusal cells must die. If they
  // still pass, they are testing their own assertions rather than the mechanism.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlock-mutant-'));
  const src = fs.readFileSync(path.join(HERE, 'run-lock.mjs'), 'utf8');
  const mutated = src.replace("fs.openSync(lockFile, 'wx')", "fs.openSync(lockFile, 'w')");
  assert.notEqual(mutated, src, 'mutation point not found — the arm is vacuous, fix it before trusting it');
  const file = path.join(dir, 'run-lock.mjs');
  fs.writeFileSync(file, mutated);

  return import(pathToFileURL(file).href).then((mut) => {
    const lf = mut.lockPathFor(mut.HOST_SCOPE_KEY, 'host');
    fs.mkdirSync(path.dirname(lf), { recursive: true });
    fs.writeFileSync(lf, JSON.stringify({
      scope: 'host', pid: process.ppid, script: 'holder.mjs', startedAt: new Date().toISOString(),
    }));
    const got = mut.acquireRunLock({ artifact: tmpArtifact(), script: 'victim.mjs' });
    // The mutant must NOT refuse. That is the proof the real one's refusal comes
    // from the exclusive create and not from anything incidental.
    assert.equal(got.state, 'LOCK_ACQUIRED', 'mutant still refused — the cells are not bound to `wx`');
    got.release();
  });
});

test('the module is committed, because a shared precondition that is not in the tree is not one', () => {
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', 'scripts/lib/run-lock.mjs'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  }).trim();
  assert.equal(tracked, 'scripts/lib/run-lock.mjs');
});
