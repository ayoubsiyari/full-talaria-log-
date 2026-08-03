/**
 * Drives the ORDER-01B canary's page-side probes without a browser.
 *
 * The reason this file exists is a specific failure: the b126 read-back canary
 * produced an artifact whose four-panel reading had one panel parked, and the
 * logic written to prevent a repeat — runway gate, product-path-first start,
 * sliced window — had never executed at the moment it was committed. On a box
 * where every Chrome-launching run waits behind someone else's ninety-minute
 * measurement, an untested branch costs an hour per typo and, worse, produces
 * another uncitable artifact.
 *
 * The fake world below reproduces the exact b126 shape: a `top` realm holding
 * 1881 bars with its playhead on the last one, three panels holding 4000 with
 * 1275 bars of runway. Cells then cover the states that only appear on a
 * defective page — an inert instance `play()`, a realm that will not start at
 * all, a `seekTo` that throws, and a realm that runs and then parks mid-window.
 *
 * Run: node scripts/lib/canary-realm-probes.selftest.mjs
 */

import assert from 'node:assert/strict';

/**
 * The module under test is injectable so `canary-realm-probes.mutants.mjs` can
 * point these same cells at a deliberately broken copy. A selftest that has
 * never been shown to fail is a green with no load-bearing capacity — the
 * BIND-01 requirement, and the shape of three of today's false greens.
 */
const PROBES = process.env.CANARY_PROBES_MODULE || './canary-realm-probes.mjs';
const {
  governorReferencePreflight,
  prepareRealmsForWindow,
  probeArmedPositions,
  probeRealmCensus,
  sampleRealmsOverWindow,
  seedSessionStartFromLoadedData,
} = await import(PROBES);

const cells = [];
const test = (name, fn) => cells.push({ name, fn });

/* ---------------------------------------------------------------- fake world */

/**
 * A replay system that is only as real as the probes require: bars, a playhead
 * that advances in market time while playing, `seekTo`, and a `play` that can be
 * made to fail in each of the ways the product has actually failed.
 */
function makeReplaySystem({
  bars = 4000,
  index = 2724,
  playing = false,
  /** 'ok' | 'inert' | 'throws' | 'dead' — how the INSTANCE play behaves. */
  instancePlay = 'ok',
  /** Whether the prototype's play can start it once the instance cannot. */
  prototypeWorks = true,
  seekThrows = false,
  barMs = 60_000,
  marketPerWall = 10,
  /** Market seconds after which the realm parks itself, mid-window. */
  parkAfterMarketSec = null,
  /**
   * The rollback floor, honoured by `seekTo` exactly as the product does at
   * replay-system.js:8962 — `Math.max(sessionStartIndex, min(i, len-1))`. Default
   * 0 leaves every existing cell behaving as it did.
   */
  sessionStartIndex = 0,
  /** Replace the series with a shorter one after N market seconds, mid-window. */
  shrinkToAfterMarketSec = null,
  shrinkTo = null,
} = {}) {
  const proto = {
    play() {
      if (!prototypeWorks) return false;
      this.__start();
      return true;
    },
  };
  const rs = Object.create(proto);
  Object.assign(rs, {
    fullRawData: Array.from({ length: bars }, (_v, i) => ({ t: i * barMs })),
    currentIndex: index,
    isActive: true,
    isPlaying: false,
    isPlayStarting: false,
    playInterval: null,
    _nextCandleTimer: null,
    __advanced: 0,
    // A plain field, not a getter: `Object.assign` copies a getter's evaluated
    // value, so a computed `currentTime` here would freeze at construction and
    // every realm would read as motionless. The probes read this field.
    currentTime: index * barMs,
    getStepSeconds() { return 1; },
    getPlaybackMode() { return 'candle'; },
    _isAtLastLoadedBar() { return this.currentIndex >= this.fullRawData.length - 1; },
    _isSubBarStepMode() { return true; },
    sessionStartIndex,
    seekTo(i) {
      if (seekThrows) throw new Error('seek refused');
      // The clamp, verbatim in shape: a seek below the floor moves nothing and
      // says nothing, which is why seekTo(1760) left four realms at 1880.
      const floor = this.sessionStartIndex || 0;
      this.currentIndex = Math.max(floor, Math.min(i, this.fullRawData.length - 1));
      this.__advanced = 0;
      this.currentTime = this.fullRawData[this.currentIndex].t;
    },
    /** Advance market time on a wall clock, the way the engine's timer does. */
    __start() {
      if (this.__timer) return;
      this.isPlaying = true;
      this.__timer = setInterval(() => {
        this.__advanced += marketPerWall * 0.02;
        this.currentTime = this.fullRawData[this.currentIndex].t + this.__advanced * 1000;
        if (shrinkToAfterMarketSec !== null && shrinkTo !== null
          && this.__advanced >= shrinkToAfterMarketSec && this.fullRawData.length > shrinkTo) {
          // The series being replaced by a shorter one under a live playhead,
          // which is what took four realms from 4000 bars to 1881 mid-run.
          this.fullRawData = this.fullRawData.slice(0, shrinkTo);
          this.currentIndex = Math.min(this.currentIndex, shrinkTo - 1);
        }
        if (parkAfterMarketSec !== null && this.__advanced >= parkAfterMarketSec) this.__stop();
      }, 20);
      if (this.__timer.unref) this.__timer.unref();
    },
    __stop() {
      if (this.__timer) clearInterval(this.__timer);
      this.__timer = null;
      this.isPlaying = false;
    },
  });
  rs.play = function instance() {
    if (instancePlay === 'throws') throw new Error('play blew up');
    if (instancePlay === 'inert') return undefined;      // the shell override shape
    if (instancePlay === 'dead') return undefined;
    // A realm on its last loaded bar cannot start: there is no bar to step to.
    if (rs._isAtLastLoadedBar()) return undefined;
    rs.__start();
    return true;
  };
  if (instancePlay === 'dead') proto.play = function dead() { return false; };
  if (playing) rs.__start();
  return rs;
}

const makeRealm = (opts) => ({ chart: { replaySystem: makeReplaySystem(opts), _panLoading: !!opts?.panLoading, currentFileId: 25 } });

/** Install a fake page: `window` is the top realm, iframes are the peers. */
function installWorld(realms) {
  const [top, ...peers] = realms;
  const iframes = peers.map((w, i) => ({ id: `panel${i + 1}`, contentWindow: w }));
  globalThis.window = { ...top, __talariaChartWindowBlocked: false };
  globalThis.document = { querySelectorAll: (sel) => (sel === 'iframe' ? iframes : []) };
  return { top: globalThis.window, peers };
}

function teardownWorld() {
  const stopAll = (w) => { try { w.chart.replaySystem.__stop(); } catch (_e) { /* ignore */ } };
  if (globalThis.window) stopAll(globalThis.window);
  for (const f of globalThis.document ? globalThis.document.querySelectorAll('iframe') : []) stopAll(f.contentWindow);
  delete globalThis.window;
  delete globalThis.document;
}

/** The b126 shape, exactly: host parked at its loaded edge, peers with runway. */
const b126World = () => [
  makeRealm({ bars: 1881, index: 1880, playing: false, panLoading: true }),
  makeRealm({ bars: 4000, index: 2724, playing: true }),
  makeRealm({ bars: 4000, index: 2724, playing: true }),
  makeRealm({ bars: 4000, index: 2724, playing: true }),
];

/* -------------------------------------------------------------------- cells */

test('the census reports bars and in-flight fetches for every realm', () => {
  installWorld(b126World());
  const census = probeRealmCensus();
  assert.equal(census.length, 4);
  assert.deepEqual(census.map((c) => c.rawBars), [1881, 4000, 4000, 4000]);
  assert.deepEqual(census.map((c) => c.panLoading), [true, false, false, false]);
  assert.ok(census.every((c) => c.hasReplay));
});

test('armed positions reproduce the b126 record — fromEnd 0 against 1275', () => {
  installWorld(b126World());
  const at = probeArmedPositions();
  assert.equal(at[0].fromEnd, 0, 'the host realm sat on its last loaded bar');
  assert.equal(at[0].playing, false);
  assert.deepEqual(at.slice(1).map((r) => r.fromEnd), [1275, 1275, 1275]);
  assert.ok(at.slice(1).every((r) => r.playing));
});

test('the runway gate rewinds the parked realm and starts it through play()', async () => {
  installWorld(b126World());
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  const top = prep[0];
  assert.equal(top.before.fromEnd, 0);
  assert.equal(top.seekedTo, 1760, 'rewound to leave exactly the runway asked for');
  assert.equal(top.after.fromEnd, 120);
  assert.equal(top.startedVia, 'instance-play', 'the product path started it once it had somewhere to go');
  assert.equal(top.after.playing, true);
  // The realms that were already playing are left alone and say so.
  assert.deepEqual(prep.slice(1).map((p) => p.startedVia), ['already-playing', 'already-playing', 'already-playing']);
  assert.ok(prep.every((p) => p.after.fromEnd >= 120), 'every realm holds the runway the window needs');
});

test('a realm whose instance play() is inert is started by the prototype AND reported', async () => {
  installWorld([
    makeRealm({ bars: 4000, index: 1000, instancePlay: 'inert', prototypeWorks: true }),
    makeRealm({ bars: 4000, index: 1000, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep[0].startedVia, 'prototype-fallback');
  assert.equal(prep[0].after.playing, true, 'the reading is still possible');
  // And the canary turns exactly this field into its own red, so the workaround
  // cannot silently enable a measurement while hiding the defect.
  assert.equal(prep.filter((p) => p.startedVia === 'prototype-fallback').length, 1);
});

test('a realm that no path can start is would-not-start, not a silent zero', async () => {
  installWorld([
    makeRealm({ bars: 4000, index: 1000, instancePlay: 'dead', prototypeWorks: false }),
    makeRealm({ bars: 4000, index: 1000, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep[0].startedVia, 'would-not-start');
  assert.equal(prep[0].after.playing, false);
});

test('an instance play() that throws does not abort the other realms', async () => {
  installWorld([
    makeRealm({ bars: 4000, index: 1000, instancePlay: 'throws', prototypeWorks: true }),
    makeRealm({ bars: 4000, index: 1000, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep.length, 2);
  assert.equal(prep[0].startedVia, 'prototype-fallback');
});

test('a seekTo that throws yields ONE row for that realm, named SEEK_THREW', async () => {
  // Regression: the first draft pushed a SEEK_THREW row and then a PREPARED row
  // for the same realm, so a four-realm page produced five rows and every
  // count downstream — parked, notPlaying, fellBack — was computed on five.
  installWorld([
    makeRealm({ bars: 1881, index: 1880, seekThrows: true }),
    makeRealm({ bars: 4000, index: 2724, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep.length, 2, 'one row per realm, always');
  assert.equal(prep[0].state, 'SEEK_THREW');
  assert.equal(prep[0].why, 'seek refused');
});

test('a realm with no replaySystem is NO_REPLAY_SYSTEM and does not throw', async () => {
  installWorld([{ chart: null }, makeRealm({ playing: true })]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep[0].state, 'NO_REPLAY_SYSTEM');
  assert.equal(prep.length, 2);
});

test('the session start is seeded from each realm\'s own data, leaving runway', () => {
  const world = installWorld(b126World());
  const seeded = seedSessionStartFromLoadedData({ fractionIn: 0.1 });
  assert.equal(seeded.length, 4);
  // Derived per realm, so the short realm gets a proportionally early start
  // rather than a date chosen against somebody else's series.
  assert.equal(seeded[0].bars, 1881);
  assert.equal(seeded[0].index, 188);
  assert.equal(seeded[0].runwayBars, 1692);
  assert.equal(seeded[1].bars, 4000);
  assert.equal(seeded[1].index, 400);
  assert.ok(seeded.every((s) => s.state === 'SEEDED'));
  // And it is written where enterReplayMode reads it.
  assert.equal(world.top.chart.backtestingSession.startDate, seeded[0].startDate);
  assert.ok(Date.parse(seeded[0].startDate) > 0);
});

test('seeding a realm with no data is NO_DATA, not a crash or a silent skip', () => {
  installWorld([{ chart: { replaySystem: null, rawData: [] } }, makeRealm({ playing: true })]);
  const seeded = seedSessionStartFromLoadedData({ fractionIn: 0.1 });
  assert.equal(seeded[0].state, 'NO_DATA');
  assert.equal(seeded.length, 2, 'one row per realm even when one has nothing');
});

test('a realm pinned at its rollback floor is named, not reported as a failed rewind', async () => {
  // The 17:22+01:00 re-run issued seekTo(1760) to four realms and all four stayed
  // at 1880. `seekTo` clamps to sessionStartIndex, and the backtest path sets that
  // floor to the last bar when no loaded bar is at or after the session start
  // (replay-system.js:4297, :4301). "The rewind did not work" and "the rewind
  // could never have worked" need different fixes, so they need different states.
  installWorld([
    makeRealm({ bars: 1881, index: 1880, sessionStartIndex: 1880 }),
    makeRealm({ bars: 4000, index: 2724, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  const top = prep[0];
  assert.equal(top.seekedTo, 1760, 'the gate still asks, so the refusal is observed rather than assumed');
  assert.equal(top.seekHeld, false, 'and it records that the seek did not take');
  assert.match(String(top.runwayBlocked), /RUNWAY_BLOCKED_BY_SESSION_FLOOR/);
  assert.match(String(top.runwayBlocked), /1880 > target 1760/);
  assert.equal(top.after.fromEnd, 0, 'still parked, and now the artifact says why');
  assert.equal(top.before.sessionStartIndex, 1880);
});

test('a realm with a floor below the target rewinds, and seekHeld says so', async () => {
  installWorld([
    makeRealm({ bars: 1881, index: 1880, sessionStartIndex: 100 }),
    makeRealm({ bars: 4000, index: 2724, playing: true }),
  ]);
  const prep = await prepareRealmsForWindow({ runway: 120, speed: 10, step: 1 });
  assert.equal(prep[0].seekHeld, true);
  assert.equal(prep[0].runwayBlocked, null, 'no refusal to report when the floor allows it');
  assert.equal(prep[0].after.fromEnd, 120);
  assert.equal(prep[0].startedVia, 'instance-play');
});

test('a series replaced under a live playhead is visible per slice, not only at the end', async () => {
  installWorld([
    makeRealm({
      bars: 4000, index: 1000, playing: true, marketPerWall: 10,
      shrinkToAfterMarketSec: 2, shrinkTo: 1881,
    }),
    makeRealm({ bars: 4000, index: 1000, playing: true, marketPerWall: 10 }),
  ]);
  const out = await sampleRealmsOverWindow({ sampleMs: 800, sliceMs: 200 });
  const lens = out.slices.map((s) => s.perRealm[0].rawBars);
  assert.ok(lens.some((v) => v === 4000) || lens.some((v) => v === 1881),
    `expected the length to be recorded per slice, saw ${JSON.stringify(lens)}`);
  assert.equal(lens[lens.length - 1], 1881, 'and to end on the shorter series');
  const lost = out.slices.map((s) => s.perRealm[0].barsLost).filter((v) => v);
  assert.ok(lost.some((v) => v > 0), `expected a slice to record bars lost, saw ${JSON.stringify(lost)}`);
  // The control realm kept its series, so this is not a property of the sampler.
  assert.ok(out.slices.every((s) => s.perRealm[1].rawBars === 4000));
});

test('the window is sliced, and every slice carries its own rate', async () => {
  installWorld([
    makeRealm({ bars: 4000, index: 1000, playing: true, marketPerWall: 10 }),
    makeRealm({ bars: 4000, index: 1000, playing: true, marketPerWall: 10 }),
  ]);
  const out = await sampleRealmsOverWindow({ sampleMs: 600, sliceMs: 200 });
  assert.equal(out.slices.length, 3, 'three slices of 200ms in a 600ms window');
  assert.equal(out.sliceSeconds, 0.2);
  assert.ok(out.windowSeconds >= 0.6, `window measured ${out.windowSeconds}s`);
  for (const s of out.slices) {
    for (const r of s.perRealm) {
      assert.ok(r.marketSecAdvanced > 0, 'a playing realm advances in every slice');
      assert.ok(r.marketPerWall > 4 && r.marketPerWall < 25, `rate ${r.marketPerWall} in the plausible band`);
    }
  }
  // And the whole-window row still agrees with the slices, since both read the
  // same playhead — the check that would have caught an averaging error.
  assert.ok(out.rows.every((r) => r.marketSecAdvanced > 0));
});

test('a realm that parks mid-window produces a zero slice, not a halved average', async () => {
  // This is the discrimination the 8-second single delta could not make, and the
  // reason the window is sliced at all.
  installWorld([
    makeRealm({ bars: 4000, index: 1000, playing: true, marketPerWall: 10, parkAfterMarketSec: 2 }),
    makeRealm({ bars: 4000, index: 1000, playing: true, marketPerWall: 10 }),
  ]);
  const out = await sampleRealmsOverWindow({ sampleMs: 800, sliceMs: 200 });
  const parked = out.slices.map((s) => s.perRealm[0].marketSecAdvanced);
  const steady = out.slices.map((s) => s.perRealm[1].marketSecAdvanced);
  assert.ok(parked.some((v) => v === 0), `expected a dead slice, saw ${JSON.stringify(parked)}`);
  assert.ok(steady.every((v) => v > 0), `the control realm ran throughout, saw ${JSON.stringify(steady)}`);
  // The whole-window row for the parked realm is non-zero and would have read as
  // healthy on its own. That is the point.
  assert.ok(out.rows[0].marketSecAdvanced > 0);
  assert.equal(out.rows[0].playingAfter, false);
});

test('a realm that never moves is diagnosed rather than left as a bare zero', async () => {
  installWorld([
    makeRealm({ bars: 1881, index: 1880, playing: false, panLoading: true }),
    makeRealm({ bars: 4000, index: 1000, playing: true }),
  ]);
  const out = await sampleRealmsOverWindow({ sampleMs: 300, sliceMs: 150 });
  assert.equal(out.rows[0].marketSecAdvanced, 0);
  assert.ok(out.rows[0].diagnosis, 'a still realm carries a diagnosis');
  assert.equal(out.rows[0].diagnosis.atLastBar, true);
  assert.equal(out.rows[0].diagnosis.panLoading, true);
  assert.equal(out.rows[0].diagnosis.subBarMode, true);
  assert.equal(out.rows[1].diagnosis, null, 'a healthy realm carries none');
});

/* ------------------------------------------- GOVERNOR-REF-01 launch pre-flight */

const govRow = (realm, seconds) => ({
  realm, state: 'READ', currentTimeframe: `${seconds}s`, chartTimeframeSeconds: seconds,
  stepSeconds: 1, dataFloorSeconds: seconds, speed: 10, sessionStartIndex: 0, rawBars: 3504,
  currentIndex: 0, hasFocus: false, floorPinnedToEnd: false,
});
const govProbe = (secondsList, { focusedPanel = 'host:body', focusedTimeframeSeconds = null } = {}) => ({
  focusedPanel,
  focusedTimeframeSeconds,
  minDisplayedTimeframeSeconds: Math.min(...secondsList),
  maxDisplayedTimeframeSeconds: Math.max(...secondsList),
  rows: secondsList.map((s, i) => govRow(i === 0 ? 'top' : 'panel', s)),
});

test('pre-flight passes when every realm paces off the finest displayed timeframe', () => {
  const out = governorReferencePreflight(govProbe([60, 60, 60, 60]));
  assert.equal(out.state, 'REFERENCE_MATCHES_MIN_DISPLAYED');
  assert.equal(out.ok, true);
  assert.equal(out.referenceSeconds, 60);
  assert.equal(out.minDisplayedSeconds, 60);
  assert.deepEqual(out.offenders, []);
});

test('RED: this is the W1 layout, and it must still pass — all four on 1m', () => {
  // The reading that produced 0.08 was NOT a reference mismatch, and the
  // pre-flight must not retroactively invent one. A gate that refuses the run it
  // was written after is a gate nobody can use.
  const out = governorReferencePreflight(govProbe([60, 60, 60, 60], { focusedPanel: 'host:body' }));
  assert.equal(out.ok, true, 'the W1 layout was uniform 1m and is legitimately launchable');
});

test('RED: the PO layout — mixed timeframes, so a realm paces off something coarser', () => {
  // 1m / 5m / 15m / 1h. Clicking the 5m panel speeds everything up, which is the
  // defect; launching at all on this layout produces a reading of the layout.
  const out = governorReferencePreflight(govProbe([60, 300, 900, 3600]));
  assert.equal(out.state, 'REFERENCE_COARSER_THAN_MIN_DISPLAYED');
  assert.equal(out.ok, false);
  assert.equal(out.minDisplayedSeconds, 60);
  assert.equal(out.offenders.length, 3, 'the three coarser realms are named, not just counted');
  assert.deepEqual(out.offenders.map((o) => o.chartTimeframeSeconds), [300, 900, 3600]);
});

test('RED: focus on a coarser panel gets its own state, because it is the named cause', () => {
  const out = governorReferencePreflight(
    govProbe([60, 300], { focusedPanel: 'panel', focusedTimeframeSeconds: 300 }),
  );
  assert.equal(out.state, 'FOCUSED_PANEL_COARSER_THAN_MIN_DISPLAYED');
  assert.equal(out.ok, false);
  assert.equal(out.referenceSeconds, 300);
  assert.equal(out.minDisplayedSeconds, 60);
  assert.match(out.why, /finest panel displayed is 60s/);
});

test('focus on the finest panel is fine, so the focus check is not unconditionally red', () => {
  const out = governorReferencePreflight(
    govProbe([60, 60], { focusedPanel: 'panel', focusedTimeframeSeconds: 60 }),
  );
  assert.equal(out.ok, true);
});

test('an unreadable reference refuses rather than being skipped', () => {
  const probe = govProbe([60, 60]);
  probe.rows[1].chartTimeframeSeconds = null;
  const out = governorReferencePreflight(probe);
  assert.equal(out.state, 'REFERENCE_UNREADABLE');
  assert.equal(out.ok, false);
  assert.equal(out.offenders.length, 1);
});

test('no probe, or no realms, refuses — absence is never a pass', () => {
  assert.equal(governorReferencePreflight(null).state, 'PROBE_ABSENT');
  assert.equal(governorReferencePreflight(null).ok, false);
  assert.equal(governorReferencePreflight({ rows: [] }).state, 'NO_REALMS_READ');
  assert.equal(governorReferencePreflight({ rows: [{ realm: 'top', state: 'NO_REPLAY' }] }).state, 'NO_REALMS_READ');
});

test('a single realm is launchable: its own timeframe is trivially the minimum', () => {
  const out = governorReferencePreflight(govProbe([3600]));
  assert.equal(out.ok, true);
  assert.equal(out.minDisplayedSeconds, 3600);
});

/* --------------------------------------------------------------------- run */

let failed = 0;
for (const cell of cells) {
  try {
    await cell.fn();
    console.log(`  PASS  ${cell.name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${cell.name}`);
    console.log(`        ${String(error && error.message).split('\n').slice(0, 6).join('\n        ')}`);
  } finally {
    teardownWorld();
  }
}
console.log(`\n  ${cells.length - failed}/${cells.length} cells`);
process.exitCode = failed ? 1 : 0;
