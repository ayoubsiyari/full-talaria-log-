/**
 * TAL-01865 viewport restore — THE CONSUMER.
 *
 * Context, because this row is the reason the policy axes exist. The chain was:
 * capture the window -> persist it -> hand it to the manager -> manager writes
 * `restoreStart`/`restoreEnd` onto the panel URL -> **nobody reads it**. Every
 * link was present, mirrored and green, and the feature did nothing. The
 * binding gate's own cell ("the boot cfg carries the pair") passed against a
 * chain that ended in a dead end.
 *
 * So this gate is deliberately not satisfied by the parameter existing, or by
 * the function existing. Every cell drives the real lifted code and asserts on
 * what reaches `setVisibleTimeRange` — the one call that actually moves a
 * viewport — and the mutant arm removes that call to prove the cells can fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Walk up to the repo root so this file behaves identically from either mirror. */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  assert.fail(`ANCHOR_BROKEN: repo root not found from ${start}`);
  return null;
}

const ROOT = findRoot(HERE);
const BRIDGE = path.join(ROOT, 'chart v 1.4/chart/multichart-prod/sync-bridge.js');
const MIRROR = path.join(ROOT, 'homepage/public/chart/multichart-prod/sync-bridge.js');
const SRC = fs.readFileSync(BRIDGE, 'utf8');

/** Lift a named function declaration, brace-matched. */
function liftFn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) {
    const state = source.includes(name) ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: ${name}`);
  }
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`ANCHOR_BROKEN: ${name} — unbalanced braces`);
  return null;
}

/**
 * Run the real lifted restore against a controllable world.
 * `barsAfter` = how many timer ticks pass before the chart has data, so the
 * "bars arrive late" case is a first-class scenario rather than a happy path.
 */
function drive({
  search = '?restoreStart=1000&restoreEnd=2000',
  killed = false,
  barsAfter = 0,
  source = SRC,
  fireUserInputAfter = null,
} = {}) {
  const applied = [];
  const timers = [];
  const listeners = [];
  const chart = { data: [], canvas: {} };

  const global = {
    __TALARIA_DISABLE_VIEWPORT_RESTORE_V1: killed || undefined,
    location: { search },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    addEventListener: (ev, fn) => { listeners.push({ ev, fn }); },
  };

  const ctx = vm.createContext({
    Number, URLSearchParams, Array, Object, console,
    global, chart,
    setVisibleTimeRange: (c, s, e) => { applied.push({ s, e }); },
  });

  const body = `
    ${liftFn(source, 'bootViewportRestoreEnabled')}
    ${liftFn(source, 'scheduleBootViewportRestore')}
    scheduleBootViewportRestore();
  `;
  vm.runInContext(body, ctx);

  // Pump the timer queue. Bars appear after `barsAfter` ticks.
  let ticks = 0;
  while (timers.length && ticks < 60) {
    const fn = timers.shift();
    if (ticks === barsAfter) chart.data = [{ t: 1_200_000 }, { t: 1_800_000 }];
    if (fireUserInputAfter != null && ticks === fireUserInputAfter) {
      listeners.forEach((l) => { try { l.fn(); } catch (_) {} });
    }
    fn();
    ticks += 1;
  }
  return { applied, chart, ticks, listeners };
}

test('VIEWPORT: green — the boot URL window reaches setVisibleTimeRange', () => {
  const { applied, chart } = drive();
  assert.equal(applied.length, 1, 'the persisted window never reached the one call that moves a viewport');
  assert.deepEqual({ ...applied[0] }, { s: 1000, e: 2000 }, 'the window was altered in transit');
  assert.equal(chart.__talariaBootViewportRestored.startSec, 1000, 'no restore receipt left on the chart');
});

test('VIEWPORT: it waits for bars rather than firing into an empty chart', () => {
  // setVisibleTimeRange no-ops on an empty chart, so firing once at t=0 and
  // giving up would look identical to working in any test that only counts
  // the call. This asserts it lands AFTER the data arrives.
  const { applied } = drive({ barsAfter: 6 });
  assert.equal(applied.length, 1, 'the restore did not survive a slow bar load');
  assert.deepEqual({ ...applied[0] }, { s: 1000, e: 2000 });
});

test('VIEWPORT: restore-only — it applies exactly once, never continuously', () => {
  const { applied, ticks } = drive();
  assert.equal(applied.length, 1, `applied ${applied.length} times; a restore that repeats is a sync, not a restore`);
  assert.ok(ticks < 60, 'the poll never terminated');
});

test('VIEWPORT: it gives up rather than polling forever for bars that never come', () => {
  const { applied, ticks } = drive({ barsAfter: 999 });
  assert.equal(applied.length, 0, 'it applied to a chart that never got data');
  assert.ok(ticks <= 26, `bounded retry expected, ran ${ticks} ticks`);
});

test('VIEWPORT: it abandons the moment the user touches the chart', () => {
  // A late snap that yanks the view out from under a pan is worse than no
  // restore, so user input has to win.
  const { applied, listeners } = drive({ barsAfter: 6, fireUserInputAfter: 2 });
  assert.equal(applied.length, 0, 'the restore fired after the user had already taken control');
  const evs = listeners.map((l) => l.ev).sort();
  assert.deepEqual(evs, ['keydown', 'mousedown', 'touchstart', 'wheel'], 'user-input abandon is not wired to the real inputs');
});

test('VIEWPORT: anti-vacuity — nothing to restore means nothing happens', () => {
  assert.equal(drive({ search: '' }).applied.length, 0, 'a bare boot invented a window');
  assert.equal(drive({ search: '?restoreStart=1000' }).applied.length, 0, 'a half-present window was accepted');
  assert.equal(drive({ search: '?restoreStart=2000&restoreEnd=1000' }).applied.length, 0, 'an inverted window was accepted');
  assert.equal(drive({ search: '?restoreStart=abc&restoreEnd=def' }).applied.length, 0, 'a non-numeric window was accepted');
});

test('VIEWPORT: the kill switch stops it dead', () => {
  const { applied } = drive({ killed: true });
  assert.equal(applied.length, 0, 'the kill switch does not disable the restore');
});

test('VIEWPORT: mutant — cutting the apply call is caught', () => {
  // Without this, every cell above could be asserting on a spy that the
  // product happens to call for some other reason.
  const mutated = SRC.replace(
    'setVisibleTimeRange(chart, startSec, endSec);',
    '/* mutant: apply removed */',
  );
  assert.notEqual(mutated, SRC, 'ANCHOR_BROKEN: apply call not found to mutate');
  const { applied } = drive({ source: mutated });
  assert.equal(applied.length, 0, 'the gate would pass with the viewport apply removed');
});

test('VIEWPORT: mutant — removing the kill-switch check is caught', () => {
  const mutated = SRC.replace(
    'if (!bootViewportRestoreEnabled()) return;',
    '/* mutant: kill switch ignored */',
  );
  assert.notEqual(mutated, SRC, 'ANCHOR_BROKEN: kill-switch guard not found to mutate');
  const { applied } = drive({ killed: true, source: mutated });
  assert.equal(applied.length, 1, 'the kill-switch cell would pass with the guard removed');
});

test('VIEWPORT: bound — the restore is actually invoked at bridge boot', () => {
  // Present is not bound. The function could be perfect and never called.
  assert.match(
    SRC,
    /try \{ scheduleBootViewportRestore\(\); \} catch \(_\) \{\}/,
    'the restore is defined but never invoked — present and bound to nothing',
  );
  const at = SRC.indexOf('try { scheduleBootViewportRestore(); } catch (_) {}');
  const readyAt = SRC.indexOf("type: 'bridge-ready'");
  assert.ok(at > readyAt, 'the restore is scheduled before the bridge reports ready');
});

test('VIEWPORT: the served mirror carries the same bytes', () => {
  assert.ok(fs.existsSync(MIRROR), 'RESOLVER_ABSENT_FROM_TREE: served mirror');
  assert.equal(fs.readFileSync(MIRROR, 'utf8'), SRC, 'the mirror has drifted from canonical');
});
