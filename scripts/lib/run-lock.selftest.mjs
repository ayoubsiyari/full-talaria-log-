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
  acquireRunLockOrExit,
  browserOwningPids,
  classifyRunStrict,
  foreignRuns,
  foreignRunsSync,
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

test('RED — THE 12:04+01:00 ACCIDENT: two different scripts cannot both hold the box', () => {
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

test('browserOwningPids distinguishes "none" from "could not ask"', () => {
  const pids = browserOwningPids();
  // null is the failure answer and must stay distinguishable from an empty set,
  // or a broken query reads as a clear box.
  assert.ok(pids === null || pids instanceof Set, String(pids));
  if (pids instanceof Set) for (const p of pids) assert.ok(Number.isFinite(p));
});

test('a named measurement with no browser under it is advised, not blocked on', async () => {
  // ckpt-ship-tag-first.test.mjs was on the box and matched by name. Blocking
  // measurements behind unit gates that share the .test.mjs suffix would make
  // this gate the outage; only an observed browser refuses.
  const scan = await foreignRuns();
  for (const r of scan.runs) assert.notEqual(r.hasBrowser, false);
  for (const a of scan.advisory) {
    if (a.excludedBecause === 'no browser process is running under it') assert.equal(a.hasBrowser, false);
  }
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

/**
 * My two cells below plant a REAL host lock, because LOCK_DIR is a constant with
 * no override, and they hold it across a process spawn rather than for the
 * microseconds A's cells need. While it is planted, a lane launching a
 * measurement is refused — so running the suite can park the very box it exists
 * to protect. Not hypothetical: I ran it three times between 14:44+01:00 and
 * 14:49+01:00 with A's canary and D's mutant suite in the queue.
 *
 * So the cells ask first, and say which state they are in. A silent skip would be
 * worse than the collision: a suite that quietly declines its own load-bearing
 * cells reads as a pass, which is the disease this whole day has been about.
 *
 * The durable fix is an env override on LOCK_DIR so the suite can isolate
 * entirely. That is a change to the shared primitive and it is not being made
 * mid-queue — proposed on BOARD-A instead.
 */
function boxBusyReason() {
  const held = inspectLocks().filter((l) => l.alive
    && l.pid !== process.pid && l.pid !== process.ppid);
  if (held.length) {
    return `LOCK_HELD_BY_ANOTHER_RUN — ${held.map((h) => `${h.script || '?'}@${h.pid}`).join(', ')}`;
  }
  const foreign = foreignRunsSync({ ignorePids: [process.pid, process.ppid] });
  if (foreign.length) {
    return `FOREIGN_MEASUREMENT_RUNNING — ${foreign.length} process(es)`;
  }
  return null;
}

test("B's cell — a real instrument refuses before it boots anything", (t) => {
  const busy = boxBusyReason();
  if (busy) {
    // Reported, never silent: this cell did not run and must not be read as green.
    console.log(`    CELL_DEFERRED_BOX_BUSY — ${busy}. Planting a host lock now would `
      + 'refuse a live run; re-run when the queue is clear.');
    t.skip(`CELL_DEFERRED_BOX_BUSY — ${busy}`);
    return;
  }
  // The claim under test is not "it refuses" but "it refuses EARLY": the whole
  // value on a shared box is that no browser and no harness server appear. A
  // refusal that arrives after boot has already cost the thing it was preventing.
  const lf = plantLive(HOST_SCOPE_KEY, 'host', 'holder.mjs');
  try {
    // Direct evidence, not a proxy: count the browsers on the box either side of
    // the refusal. `browserOwningPids` answers `null` when it could not ask, and
    // that is reported as its own state rather than passing quietly — a scan that
    // silently opts out is the same hole wearing a tick.
    const before = browserOwningPids();

    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['scripts/order01b-readback-canary.mjs', '--speed=10', '--step=1'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000,
    });
    const elapsed = Date.now() - t0;
    const after = browserOwningPids();

    assert.equal(r.status, 3, `expected exit 3, got ${r.status}: ${r.stderr?.slice(0, 400)}`);
    assert.match(r.stderr, /HOST_BUSY_REFUSED/);
    assert.match(r.stderr, /no browser was launched/);

    if (before === null || after === null) {
      console.log('    BROWSER_SCAN_UNAVAILABLE — process evidence skipped, timing and output only');
    } else {
      assert.ok(after.size <= before.size,
        `browser-owning processes went ${before.size} -> ${after.size}; the refusal booted something`);
    }

    // 20s was the first bound here and it could not discriminate: a real boot of
    // this harness to first-ready measures 15-17s, so the old assertion passed
    // whether or not a browser had appeared. The observed refusal is ~0.5s, so
    // 5s keeps an order of magnitude of headroom while still failing a boot.
    assert.ok(elapsed < 5000, `refusal took ${elapsed}ms; a boot starts around 15000ms and this must stay nowhere near it`);
    assert.doesNotMatch(`${r.stdout || ''}${r.stderr || ''}`, /harness|listening|puppeteer/i);
  } finally { fs.unlinkSync(lf); }
});

test("B's cell — mutant swap: exclusive create is what enforces it", (t) => {
  const busy = boxBusyReason();
  if (busy) {
    console.log(`    CELL_DEFERRED_BOX_BUSY — ${busy}. The control arm plants a real host `
      + 'lock; deferring rather than refusing someone mid-run.');
    t.skip(`CELL_DEFERRED_BOX_BUSY — ${busy}`);
    return;
  }
  // BIND-01. If `wx` is weakened to `w`, the refusal cells must die. If they
  // still pass, they are testing their own assertions rather than the mechanism.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlock-mutant-'));
  const src = fs.readFileSync(path.join(HERE, 'run-lock.mjs'), 'utf8');
  const mutated = src.replace("fs.openSync(lockFile, 'wx')", "fs.openSync(lockFile, 'w')");
  assert.notEqual(mutated, src, 'mutation point not found — the arm is vacuous, fix it before trusting it');
  const file = path.join(dir, 'run-lock.mjs');
  fs.writeFileSync(file, mutated);

  return import(pathToFileURL(file).href).then((mut) => {
    // Each arm plants into its OWN lock directory. LOCK_DIR is derived from the
    // module's location, so the copy under test looks in the temp dir while the
    // real one looks in the repo — plant once for both and the control silently
    // finds an empty directory and acquires, which reads as a broken fix.
    const mutantLock = mut.lockPathFor(mut.HOST_SCOPE_KEY, 'host');
    const plantMutant = () => {
      fs.mkdirSync(path.dirname(mutantLock), { recursive: true });
      fs.writeFileSync(mutantLock, JSON.stringify({
        scope: 'host', pid: process.ppid, script: 'holder.mjs', startedAt: new Date().toISOString(),
      }));
    };
    // A/B, because "the mutant did not refuse" is on its own satisfiable by a
    // mutant that never saw a lock at all. The control is what makes the swap
    // evidence about `wx` rather than about nothing.
    let realLock = null;
    try {
      realLock = plantLive(HOST_SCOPE_KEY, 'host', 'holder.mjs');
      const control = acquireRunLock({ artifact: tmpArtifact(), script: 'victim.mjs' });
      if (control.state === 'LOCK_ACQUIRED') control.release();
      assert.equal(control.state, 'HOST_BUSY_REFUSED',
        'the real module did not refuse the planted holder, so this cell is not '
        + 'set up to detect anything and the mutant arm below proves nothing');

      plantMutant();
      const got = mut.acquireRunLock({ artifact: tmpArtifact(), script: 'victim.mjs' });
      // The mutant must NOT refuse. That is the proof the real one's refusal comes
      // from the exclusive create and not from anything incidental.
      assert.equal(got.state, 'LOCK_ACQUIRED', 'mutant still refused — the cells are not bound to `wx`');
      got.release();
    } finally {
      // A failed assertion above must not leave the REAL host lock planted.
      // Parking the box for every lane is a worse outcome than the red this cell
      // reports, and a test that fails loudly and then blocks four people has
      // not helped anyone.
      if (realLock) { try { fs.unlinkSync(realLock); } catch { /* already gone */ } }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("B's cell, closed structurally — the guard cannot depend on a caller remembering `await`", () => {
  // B's finding stands and was correct: with an async acquire, an un-awaited call
  // reached the synchronous refusal prefix, raced the unlocked-run scan it was
  // meant to be stopped by, received a Promise whose `.state` logged as undefined,
  // and left its lock to be reclaimed as stale. One consumer had already adopted
  // it that way within a commit of publishing it.
  //
  // Rather than police the keyword, the acquire path is synchronous again — the
  // scan included — so the defect has nowhere to live. `await` in front of it is
  // now a no-op, which is why the offender list below is advisory only.
  assert.notEqual(acquireRunLockOrExit.constructor.name, 'AsyncFunction',
    'acquireRunLockOrExit must stay synchronous, or a missing await silently disarms the unlocked-run scan');
  const probe = acquireRunLockOrExit({ artifact: tmpArtifact(), script: 'sync-shape-probe.mjs', host: false });
  try {
    assert.equal(typeof probe.then, 'undefined', 'it must not return a thenable');
    assert.equal(typeof probe.release, 'function');
    assert.ok(typeof probe.state === 'string');
  } finally { probe.release(); }
});

test("B's cell, as originally written — who calls it without await (advisory now)", () => {
  // Presence is not binding. `acquireRunLockOrExit` refuses on a held lock in its
  // synchronous prefix, so an un-awaited call still gets that far — which is why
  // this reads as working. What sits AFTER the first `await` is the unlocked-run
  // scan, and an un-awaited caller runs its own next statements alongside it, so
  // UNLOCKED_FOREIGN_RUN_DETECTED cannot stop a launch it is racing. The caller
  // also gets a Promise, so `.state` logs as `undefined` and `.release()` is not
  // a function, leaving the lock to be reclaimed as stale by whoever comes next.
  const dir = path.join(REPO_ROOT, 'scripts');
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /acquireRunLockOrExit\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const before = src.slice(Math.max(0, m.index - 24), m.index);
      if (/\bawait\s+$/.test(before)) continue;
      if (/[{,]\s*$/.test(before)) continue; // the import list, not a call
      offenders.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  // Reported, not failed: with a synchronous acquire these call sites are correct.
  // Kept because the list is the evidence for why the shape had to change, and
  // because it would go red again the moment anyone makes the acquire async.
  if (offenders.length) console.log(`[run-lock] un-awaited call sites (fine while acquire is sync): ${offenders.join(', ')}`);
  assert.equal(acquireRunLockOrExit.constructor.name, 'Function');
});

test('the module is committed, because a shared precondition that is not in the tree is not one', () => {
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', 'scripts/lib/run-lock.mjs'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  }).trim();
  assert.equal(tracked, 'scripts/lib/run-lock.mjs');
});
