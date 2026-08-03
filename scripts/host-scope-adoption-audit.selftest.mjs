#!/usr/bin/env node
/*
 * HOST-SCOPE-AUDIT-EXEMPT: this file sets TALARIA_HOST_SCOPE_OFF and --no-host-scope
 * as FIXTURES, to exercise the declared-off path. It launches no real browser. The
 * exemption is declared here rather than hard-coded in the audit, so it travels with
 * the reason and any future reader can see what was excused and why.
 */
/**
 * Cells for HOST-SCOPE-01: the launch binding, and the audit that counts the ways
 * around it.
 *
 * The audit's first two versions were both wrong in instructive ways and both are
 * pinned below. It reported 14 holes by matching prose — a JSDoc `@param
 * {import('puppeteer').Page}`, a WMI query string naming chrome.exe, and its own
 * regex source. Then it reported 0 by stripping string literals, which deleted the
 * very operand it was looking for. Four was the true count.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { classifyFile, stripNonCode } from './host-scope-adoption-audit.mjs';
import {
  QUEUE_STATE_FILE, claimLiveness, currentHostScope, readQueueClaim, resetHostScopeForTests,
} from './lib/run-lock.mjs';
import { withHostScope } from './lib/heap-cycle-browser.mjs';

test('a JSDoc mention of puppeteer is not a browser launch', () => {
  const jsdoc = `/**\n * @param {import('puppeteer').Page} o.page\n */\nexport function f(o) { return o; }\n`;
  assert.deepEqual(classifyFile('scripts/lib/settle-protocol.mjs', jsdoc).states, ['NO_BROWSER']);
});

test('importing puppeteer without launching it is not a hole', () => {
  // A module that takes a page or a CDP session and never launches consumes no box.
  // Counting it flagged four library modules as defects and inflated the hole count.
  const typesOnly = "import puppeteer from 'puppeteer';\nexport function attach(page) { return page; }";
  assert.deepEqual(classifyFile('scripts/lib/end-of-arm-snapshot.mjs', typesOnly).states, ['NO_BROWSER'],
    'no launch, no box, no hole');
});

test('a process query naming chrome.exe is not a browser launch', () => {
  // This flagged run-lock.mjs — the mechanism itself — as a hole in the mechanism.
  const wmi = `const out = execFileSync('powershell', ['-Command', "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\""]);`;
  assert.deepEqual(classifyFile('scripts/lib/run-lock.mjs', wmi).states, ['NO_BROWSER']);
});

test('killing a browser is not launching one', () => {
  const kill = "execSync('taskkill /F /IM chrome.exe');\nconst child = spawn(process.execPath, ['x.mjs']);";
  assert.deepEqual(classifyFile('scripts/overnight-battery.mjs', kill).states, ['NO_BROWSER']);
});

test('a real direct require plus a launch IS a hole', () => {
  const real = "const puppeteer = require('puppeteer');\nconst browser = await puppeteer.launch({ headless: true });";
  assert.deepEqual(classifyFile('scripts/replay-interval-budget-gate.mjs', real).states, ['BYPASSES_VIA_REQUIRE']);
});

test('stripNonCode must not delete the operand it is looking for', () => {
  // The second version stripped string literals, so require('puppeteer') became
  // require('') and every real bypass vanished into a clean report.
  const src = "const p = require('puppeteer');";
  assert.match(stripNonCode(src), /require\('puppeteer'\)/);
  assert.doesNotMatch(stripNonCode("// require('puppeteer')\nconst x = 1;"), /require\('puppeteer'\)/);
  assert.doesNotMatch(stripNonCode("/* require('puppeteer') */\nconst x = 1;"), /require\('puppeteer'\)/);
  // A URL's // must not be read as a comment and swallow the rest of the line.
  assert.match(stripNonCode("const u = 'https://x.test/a'; const p = require('puppeteer');"), /require\('puppeteer'\)/);
});

test('a wrapped direct require is scoped, and a duplicated loader is not', () => {
  const wrapped = "const puppeteer = withHostScope(require('puppeteer'));\nawait puppeteer.launch({});";
  assert.deepEqual(classifyFile('scripts/x.mjs', wrapped).states, ['SCOPED_VIA_WRAPPER']);
  // po-cpu-ceiling-profile.mjs had its own byte-identical copy of loadPuppeteer, so
  // it read as scoped while reaching around the chokepoint entirely.
  const dup = "async function loadPuppeteer() { return require('puppeteer'); }\nconst b = await (await loadPuppeteer()).launch({});";
  assert.ok(classifyFile('scripts/lib/po-cpu-ceiling-profile.mjs', dup).states.includes('BYPASSES_VIA_REQUIRE'),
    'a local copy of the loader is a hole that looks like adoption');
});

test('the chokepoint itself may require puppeteer directly', () => {
  // Deliberately WITHOUT withHostScope in the fixture: otherwise the wrap alone
  // clears it and the exemption for the chokepoint is never exercised. This is the
  // shape that matters — the one file whose job is to hold the direct require.
  const chokepoint = "export async function loadPuppeteer() { return require('puppeteer'); }\n"
    + 'export async function boot(p) { return p.launch({}); }';
  const row = classifyFile('scripts/lib/heap-cycle-browser.mjs', chokepoint);
  assert.ok(!row.states.includes('BYPASSES_VIA_REQUIRE'), 'the chokepoint is not a hole in itself');
  // And the same source anywhere else IS a hole.
  assert.ok(classifyFile('scripts/somewhere-else.mjs', chokepoint).states.includes('BYPASSES_VIA_REQUIRE'));
});

test('an exemption must be declared in the file, and carries its reason', () => {
  const ex = "// HOST-SCOPE-AUDIT-EXEMPT: launches a browser against a fixture, never the product\n"
    + "const p = require('puppeteer');\nawait p.launch({});";
  const row = classifyFile('scripts/whatever.mjs', ex);
  assert.deepEqual(row.states, ['EXEMPT_DECLARED']);
  assert.match(row.reason, /never the product/);
});

// --- the binding itself ---------------------------------------------------------

test('withHostScope wraps launch and passes everything else through', () => {
  let launched = 0;
  const fake = { launch: async () => { launched++; return 'browser'; }, connect: () => 'connected', version: '1.2.3' };
  const scoped = withHostScope(fake);
  assert.equal(scoped.connect(), 'connected', 'unrelated members must pass through untouched');
  assert.equal(scoped.version, '1.2.3');
  assert.notEqual(scoped.launch, fake.launch, 'launch must be the wrapped one');
  assert.equal(launched, 0, 'wrapping must not launch anything');
});

test('withHostScope is idempotent, so a double wrap cannot double-acquire', () => {
  const fake = { launch: async () => 'browser' };
  const once = withHostScope(fake);
  assert.equal(withHostScope(once), once);
});

test('the launch binding actually fires on launch, not merely on paper', async () => {
  /**
   * The first version of this cell asserted only that a launch succeeded, which
   * passed identically with the binding deleted — a mutant removing the whole guard
   * survived it. A guard reachable only by remembering to call it is what produced
   * five contention incidents today, so the assertion is now on the SIDE EFFECT:
   * after launch, host scope must have been taken.
   */
  resetHostScopeForTests();
  assert.equal(currentHostScope(), null, 'nothing may hold scope before the launch');
  let launched = false;
  const fake = { launch: async () => { launched = true; return 'browser'; } };
  const scoped = withHostScope(fake, { script: 'selftest-host-scope.mjs' });
  assert.equal(currentHostScope(), null, 'wrapping alone must not take the box');

  process.env.TALARIA_HOST_SCOPE_OFF = '1';
  try {
    await scoped.launch({});
    assert.equal(launched, true, 'with scope declared off the launch proceeds, loudly');
    const taken = currentHostScope();
    assert.ok(taken, 'the launch must have gone through ensureHostScope');
    assert.equal(taken.state, 'HOST_SCOPE_DECLARED_OFF');
    assert.equal(taken.citable, false, 'an unprotected reading is not citable as an exclusive one');
  } finally {
    delete process.env.TALARIA_HOST_SCOPE_OFF;
    resetHostScopeForTests();
  }
});

// --- the claim-liveness defect that caused tonight -------------------------------

test('THE 21:10:17+01:00 RECLAIM: a claim whose launcher exited is still live', () => {
  // E's claim recorded pid 26196. That process was gone while the run continued as
  // pid 31064, so pidAlive(claim.pid) read false, the claim read STALE, and my
  // series reclaimed the box and ran twelve arms across E's V8 read — 37 minutes
  // into the only memory read anyone completed today.
  const claim = { owner: 'E', run: 'v8-dominator-subtree-diff', pid: 26196, at: new Date().toISOString() };
  const procs = [{ pid: 31064, cmd: 'node scripts/v8-dominator-subtree-diff.mjs --arm=2' }];
  const live = claimLiveness(claim, procs);
  assert.equal(live.alive, true, 'the run is on the box, whatever the recorded pid says');
  assert.equal(live.by, 'BY_RUN_NAME');
  assert.equal(live.pid, 31064);
  assert.match(live.why, /a run whose launcher exited is still on the box/);
});

test('a claim whose run really is gone is stale, so a crash cannot park the box', () => {
  const claim = { owner: 'E', run: 'v8-dominator-subtree-diff', pid: 26196 };
  const live = claimLiveness(claim, [{ pid: 999, cmd: 'node scripts/something-else.mjs' }]);
  assert.equal(live.alive, false);
  assert.equal(live.state, 'CLAIM_STALE');
  assert.match(live.why, /no process of v8-dominator-subtree-diff is running/);
});

test('the recorded pid is honoured when it is alive, without needing the name', () => {
  const live = claimLiveness({ owner: 'C', run: 'canonical-floor-retake', pid: 4242 }, [{ pid: 4242, cmd: 'node whatever.mjs' }]);
  assert.equal(live.by, 'BY_RECORDED_PID');
  assert.equal(live.alive, true);
});

test('an unreadable process list is not an empty box', () => {
  const live = claimLiveness({ owner: 'C', run: 'x', pid: 1 }, null);
  assert.equal(live.state, 'CLAIM_LIVENESS_UNKNOWN');
  assert.equal(live.alive, true, 'a scan that failed must not grant the box');
});

test('the guard reads the SAME queue file the queue writes', async () => {
  /**
   * This is the cell that was missing. `QUEUE_STATE_FILE` was resolved as
   * `LOCK_DIR/../..`, and LOCK_DIR is `<repo>/.locks`, so it pointed one level above
   * the repo: the claim always read null and the queue check never fired. Eighteen
   * cells and fifteen mutants were green while the guard was inert against a real
   * launch, and I only found it by launching something. Two modules agreeing on a
   * path is not an implementation detail — it is the whole mechanism.
   */
  const { STATE_FILE } = await import('./measurement-queue.mjs');
  assert.equal(QUEUE_STATE_FILE, STATE_FILE, 'the guard and the queue must name one file');
  assert.ok(QUEUE_STATE_FILE.includes(`${path.sep}_evidence${path.sep}queue${path.sep}`),
    'and it must be inside the repo, not above it');

  // Round-trip through the real reader, so a path that merely looks right is not
  // taken for one that works.
  const tmp = path.join(os.tmpdir(), `queue-claim-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ claim: { owner: 'E', run: 'v8-dominator-subtree-diff', pid: 4242 } }));
  try {
    assert.equal(readQueueClaim(tmp).owner, 'E', 'the reader must actually parse a claim');
  } finally { fs.unlinkSync(tmp); }
  assert.equal(readQueueClaim(path.join(os.tmpdir(), 'definitely-not-here.json')), null,
    'and an absent file is null rather than a throw');
});

test('END TO END: a launch is refused while another lane holds a live claim', () => {
  /**
   * The cell that had to exist. Everything else here tests pieces; this runs the real
   * path in a real process and asserts the browser was never reached. A mutant that
   * deleted the queue check survived seventeen other cells, because proving it by
   * hand at the terminal is not the same as proving it.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostscope-'));
  const queueFile = path.join(dir, 'measurement-queue.json');
  // The claim's recorded pid is THIS process, so the claim is unambiguously live.
  fs.writeFileSync(queueFile, JSON.stringify({
    claim: { owner: 'E', run: 'v8-dominator-subtree-diff', pid: process.pid, at: new Date().toISOString() },
  }));
  const script = path.join(dir, 'attempt.mjs');
  fs.writeFileSync(script, [
    "const { ensureHostScope } = await import(process.argv[2]);",
    "ensureHostScope({ script: 'attempt.mjs', owner: 'A', queueFile: process.argv[3], argv: [] });",
    "console.log('REACHED_LAUNCH');",
  ].join('\n'));

  const runLockUrl = new URL('./lib/run-lock.mjs', import.meta.url).href;
  const r = spawnSync(process.execPath, [script, runLockUrl, queueFile], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 3, `must refuse with exit 3, got ${r.status}: ${out.slice(0, 300)}`);
  assert.doesNotMatch(out, /REACHED_LAUNCH/, 'the guard must refuse BEFORE the browser line is reached');
  assert.match(out, /QUEUE_HELD_BY_ANOTHER_OWNER/);
  assert.match(out, /E\/v8-dominator-subtree-diff/, 'and it must name who holds the box');

  // Same claim, same owner: our own run must not be refused by itself.
  const mine = path.join(dir, 'mine.mjs');
  fs.writeFileSync(mine, [
    "const { ensureHostScope } = await import(process.argv[2]);",
    "const s = ensureHostScope({ script: 'mine.mjs', owner: 'E', queueFile: process.argv[3], argv: ['--no-host-scope'] });",
    "console.log('STATE:' + s.state);",
  ].join('\n'));
  const r2 = spawnSync(process.execPath, [mine, runLockUrl, queueFile], { encoding: 'utf8' });
  assert.match(`${r2.stdout}${r2.stderr}`, /STATE:HOST_SCOPE_DECLARED_OFF/, 'a lane must not be blocked by its own claim');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a generic run token must not match every process on the box', () => {
  // Planting `run: 'node'` matched an editor helper, so the claim read live forever.
  // That is tonight's failure inverted: instead of stealing a measurement it blocks
  // every one. The token is matched against script identity, not the whole line.
  const procs = [
    { pid: 28524, cmd: 'C:\\Program Files\\cursor\\node.exe --inspect helper.mjs' },
    // A script whose leaf BEGINS with the generic token, which is what a lowered
    // length threshold would latch onto.
    { pid: 28525, cmd: 'node scripts/node-census.mjs' },
  ];
  const live = claimLiveness({ owner: 'E', run: 'node', pid: 999999 }, procs);
  assert.notEqual(live.by, 'BY_RUN_NAME', 'an editor helper is not E\'s measurement');

  // A real script name still matches, including when the queue drops the extension.
  const real = claimLiveness(
    { owner: 'E', run: 'v8-dominator-subtree-diff', pid: 26196 },
    [{ pid: 31064, cmd: 'node scripts/v8-dominator-subtree-diff.mjs --arm=2' }],
  );
  assert.equal(real.by, 'BY_RUN_NAME');

  // And a different script does not.
  const other = claimLiveness(
    { owner: 'E', run: 'v8-dominator-subtree-diff', pid: 26196 },
    [{ pid: 31064, cmd: 'node scripts/competitor-arena-reference.mjs' }],
  );
  assert.equal(other.alive, false);
});

test('no claim is not a live claim', () => {
  assert.equal(claimLiveness(null).alive, false);
  assert.equal(claimLiveness(null).state, 'NO_CLAIM');
});
