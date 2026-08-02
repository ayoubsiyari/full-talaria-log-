/**
 * REPLAY-RESTORE-VIEWPORT-ALIGN — a refresh lands on the playhead, not the session start.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/replay-restore-viewport-align.test.mjs"
 *
 * PO b122 test pass, intermittent: a refresh dropped the session at the
 * backtest's starting point rather than the current position, then jumped to
 * the correct point the moment play was pressed.
 *
 * The playhead value was never the problem — it restored fine. What did not
 * happen was landing the viewport on it, for any of three reasons:
 *
 *   1. the sync beside applyPersistedState is inside
 *      `if (!alreadyApplied || incomingIsAhead || incomingIsRewind)`, so when
 *      the playhead was already applied and the server agreed, nothing ran;
 *   2. the offset realign below it sits inside the `state.chartView` branch,
 *      despite its own comment saying it should always recompute when replay is
 *      active, so a session that never saved a chartView never got it;
 *   3. an unforced syncReplayViewportToPlayhead returns false without acting
 *      when _replayUserOwnsViewport() is true — and that predicate treats
 *      "offsetX is more than 20% of a candle spacing away from the playhead" as
 *      evidence the user owns the viewport. At boot nobody has panned, so the
 *      further wrong the viewport is, the more certainly the sync declines to
 *      correct it. That is the self-defeating case this suite pins.
 *
 * Pressing play only appeared to repair the restore because play() passes
 * forceRecenter and bypasses the predicate.
 *
 * Intermittency follows from (3): whether offsetX happens to be inside the 20%
 * band at that moment depends on candleWidth and on load timing, which is the
 * race with panel init.
 *
 * Kill-switch: window.__TALARIA_REPLAY_RESTORE_VIEWPORT_ALIGN
 *   - absent / anything but === false → fix ON
 *   - === false → pre-fix behaviour
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_REPLAY_RESTORE_VIEWPORT_ALIGN';

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cursor, 'chart v 1.4', 'chart', 'chart.js'))
      && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_SOURCE = fs.readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js'), 'utf8');
const REPLAY_SOURCE = fs.readFileSync(path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js'), 'utf8');

function methodSource(text, name, where) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    // BIND-01: absence is its own state and must not read as a behaviour verdict.
    throw new Error(`RESOLVER_ABSENT_FROM_TREE: ${name} is not present in ${where}.`);
  }
  return match[0].replace(/\n+$/, '\n');
}

// ---------------------------------------------------------------------------
// Root cause, executed against the real predicate rather than a model of it.
// ---------------------------------------------------------------------------

function realPredicate({ offsetX, autoOffsetX, userHasPanned = false, autoScrollEnabled = true }) {
  const sandbox = { Math, Number, Boolean };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`
class ReplayHarness {
    constructor() {
        this.isActive = true;
        this.isPlaying = false;
        this.userHasPanned = ${userHasPanned ? 'true' : 'false'};
        this.autoScrollEnabled = ${autoScrollEnabled ? 'true' : 'false'};
    }
    getReplayAutoScrollState() { return { offsetX: ${autoOffsetX} }; }
${methodSource(REPLAY_SOURCE, '_replayUserOwnsViewport', 'replay-system.js')}
}
globalThis.__r = new ReplayHarness();
`, sandbox);
  const chart = { _tfSwitchAnchorLock: false, offsetX, candleWidth: 8, candleGap: 2, getCandleSpacing: () => 10 };
  return sandbox.__r._replayUserOwnsViewport(chart);
}

test('ROOT CAUSE: a stranded viewport is misread as user-owned', () => {
  // Nobody has panned. The viewport simply has not been moved onto the playhead
  // yet, which is exactly the state a restore is supposed to correct.
  assert.equal(realPredicate({ offsetX: 0, autoOffsetX: 5000 }), true,
    'the predicate calls this user-owned, so an unforced sync would decline to fix it');
});

test('anti-vacuity: the same predicate says false when the viewport is already right', () => {
  assert.equal(realPredicate({ offsetX: 5000, autoOffsetX: 5000 }), false,
    'if this were also true the cell above would prove nothing about being stranded');
});

test('the misfire is the distance rule, not the panned flag', () => {
  // 20% of a 10px spacing is 2px: inside the band is not "owned", outside is.
  assert.equal(realPredicate({ offsetX: 5001, autoOffsetX: 5000 }), false);
  assert.equal(realPredicate({ offsetX: 5003, autoOffsetX: 5000 }), true);
});

// ---------------------------------------------------------------------------
// The fix, executed.
// ---------------------------------------------------------------------------

function alignHarness({ kill = undefined, isActive = true, userHasPanned = false, autoScrollEnabled = true, mutate = null } = {}) {
  const calls = [];
  const sandbox = { Boolean };
  sandbox.globalThis = sandbox;
  sandbox.window = kill === undefined ? {} : { [SWITCH]: kill };
  sandbox.__record = (opts) => { calls.push(opts); return true; };
  vm.createContext(sandbox);
  let body = methodSource(CHART_SOURCE, '_alignReplayViewportAfterRestore', 'chart.js')
    + '\n' + methodSource(CHART_SOURCE, '_replayRestoreViewportAlignEnabled', 'chart.js');
  if (mutate) body = mutate(body);
  vm.runInContext(`
class ChartHarness {
    constructor() {
        this.replaySystem = {
            isActive: ${isActive ? 'true' : 'false'},
            userHasPanned: ${userHasPanned ? 'true' : 'false'},
            autoScrollEnabled: ${autoScrollEnabled ? 'true' : 'false'},
            syncReplayViewportToPlayhead: (chart, opts) => __record(opts),
        };
    }
${body}
}
globalThis.__c = new ChartHarness();
`, sandbox);
  const result = sandbox.__c._alignReplayViewportAfterRestore();
  return { calls, result };
}

test('restore forces the viewport onto the playhead when nobody has panned', () => {
  const { calls } = alignHarness();
  assert.equal(calls.length, 1, 'restore must align exactly once');
  assert.equal(calls[0].forceRecenter, true,
    'without forceRecenter the real sync returns false and the viewport stays at the session start');
  assert.equal(calls[0].centerPlayhead, false, 'right-anchored, matching the rest of restore');
});

test('a genuine manual pan is still honoured', () => {
  assert.equal(alignHarness({ userHasPanned: true }).calls[0].forceRecenter, false);
  assert.equal(alignHarness({ autoScrollEnabled: false }).calls[0].forceRecenter, false);
});

test('kill switch === false stops the alignment entirely', () => {
  const { calls, result } = alignHarness({ kill: false });
  assert.equal(calls.length, 0);
  assert.equal(result, false);
});

test('only === false disables; other truthy/falsy values leave the fix on', () => {
  for (const kill of [true, 0, 1, 'false', null]) {
    assert.equal(alignHarness({ kill }).calls.length, 1,
      `${SWITCH}=${JSON.stringify(kill)} must not disable the fix`);
  }
});

test('inactive replay is left alone', () => {
  assert.equal(alignHarness({ isActive: false }).calls.length, 0);
});

test('MUTANT: an unforced align goes RED', () => {
  const ANCHOR = 'forceRecenter: !userReallyPanned';
  assert.ok(methodSource(CHART_SOURCE, '_alignReplayViewportAfterRestore', 'chart.js').includes(ANCHOR),
    `MUTANT ANCHOR BROKEN: "${ANCHOR}" absent. The mutant did not apply and this cell proved nothing.`);
  const { calls } = alignHarness({ mutate: (b) => b.replace(ANCHOR, 'forceRecenter: false') });
  assert.equal(calls[0].forceRecenter, false,
    'the unforced variant must differ — if it still forces, the cell above is not discriminating');
});

// ---------------------------------------------------------------------------
// Binding. The executed cells above are worthless if the align never runs, or
// if the contract it relies on changes underneath it.
// ---------------------------------------------------------------------------

test('BINDING: restore calls the align unconditionally, not inside the chartView branch', () => {
  const restore = methodSource(CHART_SOURCE, 'loadTradingSessionStateIfNeeded', 'chart.js');
  assert.match(restore, /this\._alignReplayViewportAfterRestore\(\)/,
    'BINDING GAP (not a behaviour failure): restore never calls the align');
  // The nesting is the whole point. The pre-existing realign sat one level deeper,
  // inside `if (state.chartView ...)`, which is why sessions that never saved a
  // chartView never got realigned.
  assert.match(restore, /^ {12}this\._alignReplayViewportAfterRestore\(\);$/m,
    'the align must sit at the top level of the restore body — if it drifts inside a '
    + 'conditional it silently stops covering the sessions that need it most');
});

test('BINDING: the sync contract this fix depends on still honours forceRecenter', () => {
  const sync = methodSource(REPLAY_SOURCE, 'syncReplayViewportToPlayhead', 'replay-system.js');
  const guards = sync.match(/opts\.forceRecenter !== true/g) || [];
  assert.ok(guards.length >= 2,
    'CONTRACT DRIFT (not a defect in this row): syncReplayViewportToPlayhead no longer has the '
    + 'forceRecenter escape hatches this fix relies on. If that changed deliberately, this row '
    + 'needs rethinking rather than repairing.');
  assert.match(sync, /_replayUserOwnsViewport\(chartInstance\)/,
    'the user-owned predicate is the specific guard being bypassed');
});
