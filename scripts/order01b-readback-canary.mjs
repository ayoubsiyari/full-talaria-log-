/**
 * ORDER-01B — `__talariaEffectiveRate` closed on a browser reading.
 *
 * THIS ROW HAS BEEN CLAIMED LANDED TWICE AND WAS ABSENT BOTH TIMES, so it does
 * not close on a grep, a unit oracle, or a source anchor. A number has to come
 * back out of a running browser, in the frame a harness attaches to, while
 * replay is actually moving.
 *
 * It also now has a unit. The scalar used to be bars per second and is now
 * market seconds per wall second, which at step=1s on a 1m chart differ by
 * sixty — so "a finite number came back" is no longer enough to close it. The
 * reading is graded against the arithmetic the two knobs imply:
 *
 *     marketSecondsPerWallSecond = speed x stepSeconds
 *
 * BIND-01. Three states are reported separately, because collapsing them is
 * how this got signed off twice on nothing:
 *
 *   ENGINE_ABSENT_FROM_SERVED_BYTES  the served replay-system.js has no
 *                                    ORDER-01B in it — the canary is booting a
 *                                    stale engine and proves nothing either way
 *   PUBLISH_ABSENT                   engine present, but no read-back appears
 *                                    on the frame a harness reads
 *   PUBLISH_WRONG                    a value appears and disagrees with the
 *                                    knobs, or does not name its unit
 *
 * The served-bytes census is first and is a hard stop: a red from a stale
 * bundle and a red from a broken publish are different findings and the second
 * must not be reported when the first is true.
 *
 *   node scripts/order01b-readback-canary.mjs
 *   node scripts/order01b-readback-canary.mjs --speed=10 --step=60
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { captureProvenance } from './lib/run-provenance.mjs';
import { acquireRunLockOrExit, lockFlagsFromArgv, writeArtifactAtomic } from './lib/run-lock.mjs';

import {
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { armHeapCyclePoWorkload } from './lib/heap-cycle-po-workload.mjs';
// Page-side probes live in their own module so they can be driven without a
// browser; see canary-realm-probes.selftest.mjs. Passed by reference to
// page.evaluate, which ships them by toString().
import {
  governorReferencePreflight,
  prepareRealmsForWindow,
  probeArmedPositions,
  probeFocusAndGovernor,
  probeRealmCensus,
  sampleRealmsOverWindow,
  seedSessionStartFromLoadedData,
} from './lib/canary-realm-probes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.split('=').slice(1).join('=');
};
const SPEED = Number(arg('speed', '10'));
const STEP = arg('step', null) === null ? null : Number(arg('step', null));
const OUT = arg('out', path.resolve(__dirname, '../docs/plan3/evidence/order01b-readback-canary.json'));

/**
 * The reading window, and it was 8 s hardcoded in the run that produced the first
 * citable b126 artifact. 81 market-seconds of advance at 10.12 market-s/wall-s is
 * a single 8-second delta: enough to prove a meter is not dead, not enough to
 * call a rate. Sampled in slices now, so drift and stalls inside the window are
 * visible instead of averaged away.
 */
const SAMPLE_MS = Number(arg('sample', '60000'));
const SLICE_MS = Number(arg('slice', '10000'));

/**
 * Bars each realm must have ahead of its playhead before the window opens.
 *
 * The same run armed the top realm at index 1880 of 1881 — `fromEnd: 0`, parked
 * on its last loaded bar with a pan load in flight — while the three panels had
 * 1275 bars of runway. It then reported `playing=3` as a pass. A four-panel
 * reading with a quarter of the workload parked measures three panels and a
 * spectator, and that criticism was levelled at another lane's measurement before
 * it applied to mine.
 */
const RUNWAY_BARS = Number(arg('runway', '120'));

/**
 * How far into each realm's loaded series the backtest session starts. A tenth
 * in leaves nine tenths to play through, which at speed 10 x step 1s on 1m bars
 * is far more market time than any window this canary takes.
 */
const SEED_FRACTION = Number(arg('seed-fraction', '0.1'));

// RUN-LOCK-01. Two lanes lost hours today to a second copy of an instrument
// starting on top of the first and rewriting its artifact. Refuse before the
// browser launches, not after the reading is taken.
const RUN_LOCK = await acquireRunLockOrExit({
  artifact: OUT,
  script: 'order01b-readback-canary.mjs',
  ...lockFlagsFromArgv(),
});

/** Markers that must be in the SERVED engine bytes, not merely on disk. */
const ENGINE_MARKERS = [
  'ORDER01B_STEP_CANDIDATE_SECONDS',
  'getMarketSecondsPerWallSecond',
  'market-seconds-per-wall-second',
  // Playback at the loaded edge. Without this the reading is taken from an
  // engine that stops after the last loaded bar, and a zero rate gets blamed
  // on the meter.
  '_waitAtLoadedEdgeWhenServerHasMore',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[order01b-readback] ${new Date().toISOString()} ${m}`);

const results = [];
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail !== undefined) console.log(`        ${detail}`);
  results.push({ ok: !!ok, label, detail: detail === undefined ? null : String(detail) });
}

function fail(state, why) {
  console.log(`\n  READ-BACK RED — ${state}`);
  console.log(`  ${why}`);
  return { state, why };
}

/**
 * Wait until every realm has stopped loading, not merely started.
 *
 * `waitConf01PanelsReady` (conf01-session.mjs:230) tests `bars > 20`, which the
 * b126 run's host realm satisfied at 1881 bars while still fetching toward 4000 —
 * so presence of data is not readiness for a step-sensitive run, and that helper
 * would have passed this case too. The condition that was missing: bar counts
 * stable across consecutive polls with no fetch in flight anywhere. A realm armed
 * mid-fetch sits on the last bar it happens to have, which is `fromEnd: 0` with
 * `panLoading: true` however much data is coming.
 */
async function waitRealmsSettled(page, { want = 4, timeoutMs = 120_000, stableFor = 3, pollMs = 1_500 } = {}) {
  const startedAt = Date.now();
  let previous = null;
  let stable = 0;
  let census = [];
  while (Date.now() - startedAt < timeoutMs) {
    census = await page.evaluate(probeRealmCensus);
    const ready = census.filter((c) => c.hasReplay && Number.isFinite(c.rawBars) && c.rawBars > 20);
    const loading = census.filter((c) => c.panLoading).map((c) => c.realm);
    const shape = JSON.stringify(census.map((c) => c.rawBars));
    if (ready.length >= want && !loading.length && shape === previous) stable += 1;
    else stable = 0;
    previous = shape;
    if (stable >= stableFor) {
      return { settled: true, waitedMs: Date.now() - startedAt, census, polls: stable };
    }
    await sleep(pollMs);
  }
  return { settled: false, waitedMs: Date.now() - startedAt, census, polls: stable };
}

async function main() {
  const distIndex = path.resolve(__dirname, '../chart v 1.4/chart/dist-v9/index.html');
  if (!fs.existsSync(distIndex)) throw new Error(`candidate build missing at ${distIndex}`);

  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });

  let verdict = null;
  /** A playback failure that must not stop the read-back probe from running. */
  let playbackFail = null;
  let observed = {};

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    // A playback loop that dies inside a tick stops silently from the outside:
    // isPlaying goes false and the playhead just stops. Capture what the page
    // threw, or the finding is "it stopped" with no cause attached.
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(`console: ${m.text().slice(0, 300)}`);
    });
    observed.pageErrors = pageErrors;
    await installBuiltProductBoot(page, {});
    const url = reactParityUrlWithLayout(
      `${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1',
    );
    log(`booting candidate  speed=${SPEED} step=${STEP === null ? 'TF' : `${STEP}s`}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForDistV9SingleReady(page, 180_000);
    await applyDistV9LayoutViaUi(page, 4);
    // Was a flat sleep(3_000). Three seconds is enough for four panels to exist
    // and not enough for four panels to finish loading, and the difference is a
    // realm armed at `fromEnd: 0`.
    const settle = await waitRealmsSettled(page, { want: 4, timeoutMs: 120_000 });
    observed.settle = settle;
    log(`realms settled=${settle.settled} after ${settle.waitedMs}ms — bars ${settle.census.map((c) => c.rawBars).join('/')}`);
    log('candidate ready');

    /* ---- 1. what engine is actually being served ------------------------ */
    console.log('\n--- served bytes: is this even the ORDER-01B engine? ---');
    const census = await page.evaluate(async (markers) => {
      const urls = performance.getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => /replay-system\.js/.test(n));
      const seen = [...new Set(urls)];
      if (!seen.length) return { fetched: false, urls: seen };
      const res = await fetch(seen[0]);
      const text = await res.text();
      return {
        fetched: true,
        urls: seen,
        bytes: text.length,
        present: markers.filter((m) => text.includes(m)),
        missing: markers.filter((m) => !text.includes(m)),
      };
    }, ENGINE_MARKERS);

    observed.servedEngine = census;
    // Build identity as the running page reports it, next to what is on disk.
    // A disagreement between these two is a mixed surface, stated rather than
    // inferred from byte counts after the fact.
    observed.provenance = {
      ...captureProvenance(distIndex),
      buildIdInPage: await page.evaluate(() => {
        try {
          return window.__TALARIA_CHART_BUILD_ID
            || document.querySelector('meta[name="talaria-chart-build-id"]')?.content
            || null;
        } catch { return null; }
      }).catch(() => null),
    };
    const prov = observed.provenance;
    console.log(`\n--- what surface is this ---\n        build ${prov.buildIdInPage} in page / ${prov.distV9BuildIdOnDisk} on disk / HEAD ${prov.headSha}`
      + `${prov.dirtyGovernedPaths.length ? ` / DIRTY: ${prov.dirtyGovernedPaths.length} governed path(s)` : ' / tree clean'}`);
    check(prov.dirtyGovernedPaths.length === 0,
      'the tree was clean, so this artifact is reproducible from HEAD',
      prov.dirtyGovernedPaths.length
        ? `MIXED SURFACE RISK — uncommitted: ${prov.dirtyGovernedPaths.slice(0, 5).join(', ')}`
        : `clean at ${prov.headSha}`);
    check(census.fetched, 'the served engine could be read back over the wire',
      census.fetched ? `${census.urls[0]} (${census.bytes} bytes)` : 'no replay-system.js resource');
    if (!census.fetched) {
      verdict = fail('ENGINE_ABSENT_FROM_SERVED_BYTES', 'No replay-system.js was served; nothing about the read-back can be concluded.');
      return;
    }
    check(census.missing.length === 0, 'the served engine carries ORDER-01B',
      census.missing.length ? `missing: ${census.missing.join(', ')}` : `all ${census.present.length} markers present`);
    if (census.missing.length) {
      verdict = fail('ENGINE_ABSENT_FROM_SERVED_BYTES',
        `The served engine is pre-ORDER-01B (missing ${census.missing.join(', ')}). A red here is a stale build, not a broken publish. Rebuild before reading the rate.`);
      return;
    }

    /* ---- 2. arm replay at known knobs ----------------------------------- */
    console.log('\n--- replay, at knobs the reading can be graded against ---');
    // Reading the cursors after the fact tells you what they settled to, not
    // what the engine saw when it decided the session was over. Record the
    // decision where it is taken, from the harness side.
    await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return;
      window.__canaryPatchedChart = window.chart;
      window.__canaryPatchedRs = rs;
      window.__canaryFinishLog = [];
      const orig = rs._finishPlaybackAtSessionEnd.bind(rs);
      rs._finishPlaybackAtSessionEnd = function patched(...a) {
        try {
          const c = this.chart && this.chart._serverCursors;
          window.__canaryFinishLog.push({
            at: Math.round(performance.now()),
            index: this.currentIndex,
            len: Array.isArray(this.fullRawData) ? this.fullRawData.length : null,
            cursorsPresent: !!c,
            hasMoreRight: c ? !!c.hasMoreRight : null,
            panLoading: !!(this.chart && this.chart._panLoading),
            edgeWaits: this._loadedEdgeWaits ?? null,
            subBar: typeof this._isSubBarStepMode === 'function' ? this._isSubBarStepMode() : null,
            playing: !!this.isPlaying,
          });
        } catch (_e) { /* ignore */ }
        return orig(...a);
      };
      // Every exit from play() except the kick-oldest window block leaves some
      // trace. Record the entry conditions so the silent one is nameable.
      window.__canaryPlayLog = [];
      // What is actually on `play` before this wrapper goes on. If something
      // else already wrapped it, the entry conditions logged below belong to
      // that wrapper and not to the engine's own play().
      const proto = Object.getPrototypeOf(rs) || {};
      window.__canaryPlayIdentity = {
        ownProperty: Object.prototype.hasOwnProperty.call(rs, 'play'),
        isPrototypeMethod: rs.play === proto.play,
        name: rs.play && rs.play.name,
        head: String(rs.play).replace(/\s+/g, ' ').slice(0, 240),
        full: String(rs.play),
      };
      const origPlay = rs.play.bind(rs);
      rs.play = function patchedPlay(...a) {
        try {
          window.__canaryPlayLog.push({
            at: Math.round(performance.now()),
            active: !!this.isActive,
            windowBlocked: !!window.__talariaChartWindowBlocked,
            hidden: typeof this._isReplayPageHidden === 'function' ? this._isReplayPageHidden() : null,
            index: this.currentIndex,
            len: Array.isArray(this.fullRawData) ? this.fullRawData.length : null,
            subBar: typeof this._isSubBarStepMode === 'function' ? this._isSubBarStepMode() : null,
          });
        } catch (_e) { /* ignore */ }
        const r = origPlay(...a);
        try {
          const last = window.__canaryPlayLog[window.__canaryPlayLog.length - 1];
          if (last) {
            last.playingOnReturn = !!this.isPlaying;
            // For B. isPlayStarting is set at the head of the deferred-start
            // block and cleared in the finally of the inner rAF, so it is true
            // for about two frames and MUST be read synchronously on return.
            // True: the call reached the deferred start, so the entry point is
            // live and this is start starvation. False: it left at a guard.
            last.isPlayStartingOnReturn = !!this.isPlayStarting;
            // Separates "reached the block but the rAF never ran" — a throttled
            // or hidden realm — from "never reached the block at all". Both
            // present as isPlayStarting false once the frames have passed.
            last.playStartRafScheduled = this._playStartRaf1 != null;
          }
        } catch (_e) { /* ignore */ }
        return r;
      };
      // The refusal is silent, so it has to be caught where it is decided.
      // Tracing the sequence rather than one predicate: "play() returned early"
      // and "play() ran and something later paused it" look identical from
      // outside, and they need different fixes.
      window.__canaryNoOpLog = [];
      window.__canaryTrace = [];
      const traced = [
        'getPlaybackMode', '_shouldUseTickAnimation', '_isReplayPageHidden',
        '_playWouldBeNoOpAtSessionEnd', '_capturePlaybackViewportLock',
        'stopAllPlayback', 'startCandleByCandle', 'startTickAnimation',
        'pause', '_runCandlePlaybackTick', 'simpleStepForward',
      ];
      for (const name of traced) {
        if (typeof rs[name] !== 'function') continue;
        const orig = rs[name].bind(rs);
        rs[name] = function tracedFn(...a) {
          const entry = { at: Math.round(performance.now()), fn: name };
          window.__canaryTrace.push(entry);
          let out;
          try {
            out = orig(...a);
          } catch (e) {
            entry.threw = String((e && e.message) || e).slice(0, 160);
            throw e;
          }
          if (typeof out === 'boolean') entry.returned = out;
          if (name === '_playWouldBeNoOpAtSessionEnd') {
            try {
              const c = this.chart && this.chart._serverCursors;
              window.__canaryNoOpLog.push({
                at: entry.at,
                answer: !!out,
                index: this.currentIndex,
                cursorsPresent: !!c,
                hasMoreRight: c ? !!c.hasMoreRight : null,
                panLoading: !!(this.chart && this.chart._panLoading),
              });
            } catch (_e) { /* ignore */ }
          }
          return out;
        };
      }
    });
    /**
     * Before arming, not after: `enterReplayMode` reads the session start when it
     * places the playhead, and it is arming that calls it. Seeded a tenth of the
     * way into each realm's own series, so the remaining nine tenths are runway
     * and the `rd.length - 1` fallback at replay-system.js:4297 — which pinned
     * every realm to its last bar in the 17:22+01:00 run — is never reached.
     */
    const sessionSeed = await page.evaluate(seedSessionStartFromLoadedData, { fractionIn: SEED_FRACTION });
    observed.sessionSeed = { fractionIn: SEED_FRACTION, realms: sessionSeed };
    console.log(`        session start seeded ${SEED_FRACTION * 100}% into each realm's data:`);
    for (const s of sessionSeed) {
      console.log(`          ${String(s.realm).padEnd(10)} ${s.state}`
        + (s.state === 'SEEDED' ? ` index ${s.index} of ${s.bars} (${s.runwayBars} bars of runway) start ${s.startDate}` : ` ${s.why || ''}`));
    }
    const unseeded = sessionSeed.filter((s) => s.state !== 'SEEDED');
    check(unseeded.length === 0, 'every realm got a session start inside its own data',
      unseeded.length
        ? `SESSION_SEED_FAILED: ${unseeded.map((s) => `${s.realm}=${s.state}`).join(', ')}`
        : `${sessionSeed.length} realms, least runway ${Math.min(...sessionSeed.map((s) => s.runwayBars))} bars`);

    /**
     * GOVERNOR-REF-01 pre-flight, before the workload is armed rather than after.
     *
     * The governor paces off a reference timeframe. If that reference is not the
     * finest timeframe on screen, the rate every panel is held to was set by
     * which panel happens to be focused, and the reading measures the layout
     * rather than the product. Refusing here costs a minute; discovering it after
     * an arm costs the arm, and after a soak costs the night.
     *
     * This lane produced 0.08 market-s/wall-s against a hand-measured 600 bars a
     * minute. The apparatus, not the product — so the apparatus now refuses to
     * start when it cannot show that it is pacing off the right clock.
     */
    const govPreflight = governorReferencePreflight(await page.evaluate(probeFocusAndGovernor));
    observed.governorPreflight = govPreflight;
    check(govPreflight.ok, 'GOVERNOR-REF-01: reference timeframe is the minimum displayed',
      `${govPreflight.state} — ${govPreflight.why}`);
    if (!govPreflight.ok) {
      for (const o of govPreflight.offenders) {
        console.log(`        offender ${String(o.realm).padEnd(12)} govRefTF=${o.chartTimeframeSeconds}s`);
      }
      console.log(`    LAUNCH REFUSED — ${govPreflight.state}. `
        + 'A rate measured on this layout would be a reading of the focused panel, not of the product.');
      throw new Error(`GOVERNOR_REF_PREFLIGHT_REFUSED: ${govPreflight.state}`);
    }

    const workload = await armHeapCyclePoWorkload(page, {
      playHoldMs: 4_000,
      replaySpeed: SPEED,
      stepSeconds: STEP,
      retainIndicators: true,
      // The shared helper's `armed` is satisfied by three of four panels playing.
      // A read-back taken with a quarter of the workload parked is not a
      // four-panel reading, so this run grades itself against four.
      requireAllPlaying: true,
    });
    observed.workload = {
      armed: workload.armed,
      observedPlaying: workload.observedPlaying,
      playingRequired: workload.playingRequired,
      playingArmedCount: workload.playingArmedCount,
      stepRefusals: workload.stepRefusals,
      // `playing` per panel, not just `replay`: the b126 artifact recorded the
      // configured rate for all four and nothing about which of them started, so
      // "never armed" and "armed and would not start" were indistinguishable in
      // the one file that should have settled it.
      panels: (workload.perPanel || []).map((p) => ({ id: p.id, replay: p.replay, playing: p.playing })),
    };
    check(!!workload.armed, 'replay is armed and playing in every panel',
      `playing=${workload.observedPlaying} of ${workload.playingRequired} required`
      + ` (helper default is 3; this run required ${workload.playingRequired})`);
    check(!(workload.stepRefusals || []).length, 'the engine accepted the step it was asked for',
      (workload.stepRefusals || []).map((r) => `${r.id}: ${r.reason}`).join('; ') || 'no refusals');

    // Where each realm was left standing. A realm parked on the last loaded bar
    // has nowhere to step to, and its zero says nothing about the meter.
    const armedAt = await page.evaluate(probeArmedPositions);
    observed.armedAt = armedAt;
    console.log('        position after arming:');
    for (const a of armedAt) {
      console.log(`          ${String(a.realm).padEnd(10)} index ${a.currentIndex} of ${a.rawBars} (${a.fromEnd} bars from the end) playing=${a.playing}`);
    }

    /* ---- give every realm runway, then start the ones that are not playing --- */
    const prep = await page.evaluate(prepareRealmsForWindow, { runway: RUNWAY_BARS, speed: SPEED, step: STEP });
    observed.prep = prep;

    console.log(`        runway gate (${RUNWAY_BARS} bars) and start path:`);
    for (const p of prep) {
      if (p.state !== 'PREPARED') { console.log(`          ${String(p.realm).padEnd(10)} ${p.state}${p.why ? ` — ${p.why}` : ''}`); continue; }
      console.log(`          ${String(p.realm).padEnd(10)} fromEnd ${p.before.fromEnd} -> ${p.after.fromEnd}`
        + `${p.seekedTo === null ? '' : ` (seeked to ${p.seekedTo}, held=${p.seekHeld})`}`
        + `  floor=${p.before.sessionStartIndex}  start=${p.startedVia}  playing=${p.after.playing}`
        + `${p.runwayBlocked ? `  ${p.runwayBlocked}` : ''}`);
    }

    /**
     * A realm pinned at its rollback floor is not a realm that refuses to play,
     * and until this check existed the two were the same red. `seekTo` clamps to
     * `sessionStartIndex`, and the backtest path sets that floor to the LAST bar
     * whenever the session's start time is later than every loaded bar — so the
     * realm can neither advance nor be rewound, by construction.
     */
    const flooredAtEnd = prep.filter((p) => p.state === 'PREPARED' && p.runwayBlocked);
    check(flooredAtEnd.length === 0,
      'no realm was pinned at its own rollback floor',
      flooredAtEnd.length
        ? `SESSION_FLOOR_AT_DATA_END on ${flooredAtEnd.length} realm(s): `
          + flooredAtEnd.map((p) => `${p.realm} floor=${p.before.sessionStartIndex} of ${p.before.rawBars} bars`).join(', ')
          + ' — the runway gate cannot rescue these, the session has to start somewhere with data ahead of it'
        : 'every realm could be rewound if it needed to be');

    check(!!(observed.settle && observed.settle.settled),
      'every realm finished loading before the workload was armed',
      observed.settle
        ? (observed.settle.settled
          ? `settled after ${observed.settle.waitedMs}ms — bars ${observed.settle.census.map((c) => c.rawBars).join('/')}`
          : `REALMS_NEVER_SETTLED after ${observed.settle.waitedMs}ms — bars ${observed.settle.census.map((c) => c.rawBars).join('/')}, `
            + `loading ${observed.settle.census.filter((c) => c.panLoading).map((c) => c.realm).join(',') || 'none'}`)
        : 'no settle census taken');

    const parked = prep.filter((p) => p.state === 'PREPARED' && (p.after.fromEnd ?? 0) < RUNWAY_BARS);
    check(parked.length === 0, 'every realm had runway to step into before the window opened',
      parked.length
        ? `REALM_ARMED_WITHOUT_RUNWAY: ${parked.map((p) => `${p.realm} fromEnd=${p.after.fromEnd}`).join(', ')}`
        : `all ${prep.length} realms >= ${RUNWAY_BARS} bars from their loaded edge`);

    const notPlaying = prep.filter((p) => p.state !== 'PREPARED' || !p.after.playing);
    check(notPlaying.length === 0, 'every realm is playing, so this is a four-panel reading',
      notPlaying.length
        ? `WORKLOAD_INCOMPLETE: ${notPlaying.map((p) => `${p.realm}=${p.startedVia || p.state}`).join(', ')}`
        : `${prep.length} of ${prep.length} playing`);

    // Separate row, because a realm that only starts via the prototype is a
    // product defect even when the reading it enables is valid.
    const fellBack = prep.filter((p) => p.startedVia === 'prototype-fallback');
    check(fellBack.length === 0, 'play() as installed started every realm it was asked to',
      fellBack.length
        ? `SHELL_PLAY_OVERRIDE_INERT on: ${fellBack.map((p) => p.realm).join(', ')} (started via prototype instead)`
        : 'no realm needed the prototype fallback');

    // Let the governor's meter fill: it reports delivery, so it needs delivery.
    // While it fills, watch the playhead directly. The meter is the thing under
    // test, so it cannot also be the evidence that replay was moving: a zero
    // from a stopped replay and a zero from a broken meter are different
    // findings and only the playhead separates them.
    // Focus and the governor's reference timeframe, on both sides of the window.
    // The PO found the governor taking wall-seconds-per-bar from the FOCUSED
    // panel's timeframe rather than the minimum displayed, so a rate measured
    // without recording focus is a reading of wherever the pointer last landed.
    const focusBefore = await page.evaluate(probeFocusAndGovernor);
    observed.focusBefore = focusBefore;
    console.log(`    --- focus and governor reference, before the window ---`);
    console.log(`        focused panel: ${focusBefore.focusedPanel}`
      + `  focusedTF=${focusBefore.focusedTimeframeSeconds}s`
      + `  minDisplayedTF=${focusBefore.minDisplayedTimeframeSeconds}s`
      + `  maxDisplayedTF=${focusBefore.maxDisplayedTimeframeSeconds}s`);
    for (const r of focusBefore.rows) {
      console.log(`        ${String(r.realm).padEnd(12)} tf=${String(r.currentTimeframe).padEnd(5)}`
        + ` govRefTF=${String(r.chartTimeframeSeconds).padEnd(6)} step=${String(r.stepSeconds).padEnd(6)}`
        + ` floor=${String(r.dataFloorSeconds).padEnd(6)} speed=${String(r.speed).padEnd(5)}`
        + ` sessionStartIndex=${String(r.sessionStartIndex).padEnd(6)} of ${String(r.rawBars).padEnd(6)}`
        + ` floorPinnedToEnd=${r.floorPinnedToEnd}`);
    }

    const truth = await page.evaluate(sampleRealmsOverWindow, { sampleMs: SAMPLE_MS, sliceMs: SLICE_MS });
    observed.playhead = truth.rows;
    observed.window = { seconds: truth.windowSeconds, sliceSeconds: truth.sliceSeconds, slices: truth.slices };

    const focusAfter = await page.evaluate(probeFocusAndGovernor);
    observed.focusAfter = focusAfter;
    check(focusBefore.focusedPanel === focusAfter.focusedPanel,
      'focus did not move during the window',
      focusBefore.focusedPanel === focusAfter.focusedPanel
        ? `focus held on ${focusAfter.focusedPanel} for the whole window`
        : `FOCUS_MOVED_MID_WINDOW: ${focusBefore.focusedPanel} -> ${focusAfter.focusedPanel}`);

    // Recorded as a finding rather than asserted: if the governor's reference is
    // the focused panel's timeframe and that is not the finest one displayed, the
    // rate every panel is held to was set by a click.
    const refIsFocusNotMin = Number.isFinite(focusBefore.focusedTimeframeSeconds)
      && Number.isFinite(focusBefore.minDisplayedTimeframeSeconds)
      && focusBefore.focusedTimeframeSeconds !== focusBefore.minDisplayedTimeframeSeconds;
    observed.governorReference = {
      focusedPanel: focusBefore.focusedPanel,
      focusedTimeframeSeconds: focusBefore.focusedTimeframeSeconds,
      minDisplayedTimeframeSeconds: focusBefore.minDisplayedTimeframeSeconds,
      state: refIsFocusNotMin ? 'FOCUSED_TF_IS_NOT_MIN_DISPLAYED' : 'FOCUSED_TF_EQUALS_MIN_DISPLAYED',
    };
    console.log(`    governor reference: ${observed.governorReference.state}`);

    // A realm that was never asked to play and one that refuses to play look
    // the same from outside. Ask the ones that are idle, once, and see.
    const revived = await page.evaluate(async () => {
      const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
      const realms = [{ w: window, name: 'top' }];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* ignore */ }
      }
      const out = [];
      for (const r of realms) {
        const rs = r.w.chart && r.w.chart.replaySystem;
        if (!rs || rs.isPlaying) continue;
        const head = () => Number(rs.currentTime != null ? rs.currentTime : rs.replayTimestamp);
        const row = { realm: r.name };

        // Two ways in. If the instance property starts nothing and the class
        // method on the same object starts playback, then whatever replaced
        // `play` is not driving this replay system.
        // Twice, because the first call has a side effect: it asks for forward
        // data. If attempt two succeeds where one failed, the fix was the data
        // arriving, not the entry point — and that is a different bug.
        const attempts = [];
        for (const n of [1, 2]) {
          const b = head();
          let startingOnReturn = null;
          let rafScheduled = null;
          try {
            rs.play();
            // Synchronous, before any await: the deferred-start flag lives for
            // roughly two frames, so a reading taken after the settle below is
            // false whether or not the block was reached.
            startingOnReturn = !!rs.isPlayStarting;
            rafScheduled = rs._playStartRaf1 != null;
          } catch (e) { row[`wrapperThrew${n}`] = String(e && e.message).slice(0, 160); }
          await sleepIn(1_200);
          attempts.push({
            attempt: n,
            playing: !!rs.isPlaying,
            timer: !!rs._nextCandleTimer,
            advancedSec: Math.round((head() - b) / 1000),
            isPlayStartingOnReturn: startingOnReturn,
            playStartRafScheduled: rafScheduled,
            // If this is still true after 1.2s the deferred start was entered
            // and then stranded, which is a third outcome again.
            isPlayStartingAfterSettle: !!rs.isPlayStarting,
          });
          if (rs.isPlaying) break;
        }
        row.viaInstanceProperty = attempts;

        if (!rs.isPlaying) {
          const proto = Object.getPrototypeOf(rs);
          const classPlay = proto && proto.play;
          if (typeof classPlay === 'function' && classPlay !== rs.play) {
            const before2 = head();
            let classStartingOnReturn = null;
            let classRafScheduled = null;
            try {
              classPlay.call(rs);
              classStartingOnReturn = !!rs.isPlayStarting;
              classRafScheduled = rs._playStartRaf1 != null;
            } catch (e) { row.classThrew = String(e && e.message).slice(0, 160); }
            await sleepIn(1_200);
            row.viaClassMethod = {
              playing: !!rs.isPlaying,
              timer: !!rs._nextCandleTimer,
              advancedSec: Math.round((head() - before2) / 1000),
              // The control arm: the engine's own play reaching the deferred
              // block while the instance property does not is the difference
              // that names the override.
              isPlayStartingOnReturn: classStartingOnReturn,
              playStartRafScheduled: classRafScheduled,
            };
          } else {
            row.viaClassMethod = { unavailable: 'no distinct prototype play' };
          }
        }
        out.push(row);
      }
      return out;
    });
    observed.revived = revived;
    const finishLog = await page.evaluate(() => window.__canaryFinishLog || []);
    observed.finishLog = finishLog;
    if (finishLog.length) {
      console.log('\n--- every time the host called the session over ---');
      for (const f of finishLog.slice(0, 8)) console.log(`        ${JSON.stringify(f)}`);
    }
    // A wrapper that was swapped out, or a chart that was rebuilt underneath it,
    // records silence that looks exactly like a call that never happened.
    const patchState = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return {
        sameChart: window.chart === window.__canaryPatchedChart,
        sameReplaySystem: !!rs && rs === window.__canaryPatchedRs,
        stillWrapped: !!rs && typeof rs._playWouldBeNoOpAtSessionEnd === 'function'
          && rs._playWouldBeNoOpAtSessionEnd.name === 'patchedNoOp',
        iframes: document.querySelectorAll('iframe').length,
      };
    });
    observed.patchState = patchState;
    console.log(`\n--- is the instrument still on the thing it was clipped to ---\n        ${JSON.stringify(patchState)}`);
    const trace = await page.evaluate(() => window.__canaryTrace || []);
    // Counts and the opening sequence, not six thousand render-driven calls:
    // the question this answers is how far into play() execution got, and a
    // raw dump of every call buries that in an unreadable packet.
    observed.trace = {
      total: trace.length,
      counts: trace.reduce((acc, e) => { acc[e.fn] = (acc[e.fn] || 0) + 1; return acc; }, {}),
      firstInOrder: trace.slice(0, 24).map((e) => e.fn),
      threw: trace.filter((e) => e.threw).slice(0, 8),
    };
    console.log('\n--- how far into play() the host gets ---');
    if (!trace.length) console.log('        nothing on the traced path ran at all');
    const counts = new Map();
    for (const e of trace) counts.set(e.fn, (counts.get(e.fn) || 0) + 1);
    for (const [fn, n] of counts) console.log(`        ${String(n).padStart(4)} x ${fn}`);
    console.log(`        first 14 in order: ${trace.slice(0, 14).map((e) => e.fn).join(' -> ')}`);
    const playIdentity = await page.evaluate(() => window.__canaryPlayIdentity || null);
    observed.playIdentity = playIdentity;
    console.log(`\n--- what 'play' was, before instrumenting it ---\n        ${JSON.stringify(playIdentity)}`);
    const playLog = await page.evaluate(() => window.__canaryPlayLog || []);
    observed.playLog = playLog;
    console.log('\n--- every call to play() on the host ---');
    if (!playLog.length) console.log('        none: nothing ever asked the host to play');
    for (const f of playLog.slice(0, 10)) console.log(`        ${JSON.stringify(f)}`);
    const noOpLog = await page.evaluate(() => window.__canaryNoOpLog || []);
    observed.noOpLog = noOpLog;
    if (noOpLog.length) {
      console.log('\n--- every time the host was asked whether Play would do nothing ---');
      for (const f of noOpLog.slice(0, 10)) console.log(`        ${JSON.stringify(f)}`);
    }
    if (revived.length) {
      console.log('\n--- idle realms, asked to play directly ---');
      for (const r of revived) console.log(`        ${String(r.realm).padEnd(12)} ${JSON.stringify(r)}`);
    }

    console.log(`\n--- the playhead, measured independently of the meter, over ${observed.window.seconds}s `
      + `in ${observed.window.slices.length} slice(s) of ${observed.window.sliceSeconds}s ---`);
    for (const t of truth.rows) {
      console.log(`        ${String(t.realm).padEnd(12)} playing=${t.playingBefore}->${t.playingAfter} advanced=${t.marketSecAdvanced}s  ${t.marketPerWall} market-s/wall-s`);
      if (t.diagnosis) console.log(`        ${' '.repeat(12)} why: ${JSON.stringify(t.diagnosis)}`);
    }
    // Per-slice, so a realm that ran then parked is not averaged into one number.
    for (const t of truth.rows) {
      const per = observed.window.slices.map((s) => {
        const row = s.perRealm.find((p) => p.realm === t.realm);
        return row && row.marketPerWall !== null ? row.marketPerWall : null;
      });
      const seen = per.filter((v) => v !== null);
      if (seen.length > 1) {
        console.log(`        ${String(t.realm).padEnd(12)} per slice: ${per.map((v) => (v === null ? '—' : v)).join(' ')}`
          + `   min ${Math.min(...seen)} max ${Math.max(...seen)}`);
      }
    }
    /**
     * The series length across the window. The re-run settled with 4000 bars in
     * every realm and opened its window with 1881 in all four, which is not a
     * stalled meter — it is the series being replaced by a shorter one underneath
     * a playhead that then sits on its last bar.
     */
    const shrunk = [];
    for (const t of truth.rows) {
      const lens = [
        observed.settle && observed.settle.census.find((c) => c.realm === t.realm)?.rawBars,
        ...observed.window.slices.map((s) => s.perRealm.find((p) => p.realm === t.realm)?.rawBars),
      ].filter((v) => Number.isFinite(v));
      if (lens.length > 1) {
        const lost = Math.max(...lens) - Math.min(...lens);
        console.log(`        ${String(t.realm).padEnd(12)} series: ${lens.join(' -> ')}${lost ? `   LOST ${lost} bars` : ''}`);
        if (lost > 0) shrunk.push({ realm: t.realm, lost, lens });
      }
    }
    check(shrunk.length === 0,
      'the bar series each realm was measured on did not change size under it',
      shrunk.length
        ? `SERIES_REPLACED_MID_RUN: ${shrunk.map((s) => `${s.realm} lost ${s.lost} bars (${s.lens.join('->')})`).join('; ')}`
        : 'every realm kept the series it settled with');

    const deadSlices = truth.rows.flatMap((t) => observed.window.slices
      .map((s, i) => ({ realm: t.realm, i, row: s.perRealm.find((p) => p.realm === t.realm) }))
      .filter((x) => x.row && x.row.marketSecAdvanced === 0));
    check(deadSlices.length === 0, 'no realm sat still for a whole slice inside the window',
      deadSlices.length
        ? `STALLED_SLICE: ${deadSlices.slice(0, 6).map((d) => `${d.realm}@slice${d.i + 1}`).join(', ')}`
        : `all realms advanced in all ${observed.window.slices.length} slices`);

    const topHead = truth.rows.find((t) => t.realm === 'top');
    const replayMoved = !!topHead && Number.isFinite(topHead.marketPerWall) && topHead.marketPerWall > 0;
    check(replayMoved, 'replay actually moved during the reading window',
      topHead ? `${topHead.marketSecAdvanced}s of market time over ${observed.window.seconds}s` : 'no top realm');
    const stalled = truth.rows.filter((t) => t.playingBefore === true && t.playingAfter === false);
    check(stalled.length === 0, 'no realm stopped playing during the window',
      stalled.length ? `${stalled.map((s) => `${s.realm} after ${s.marketSecAdvanced}s`).join(', ')}` : 'all realms still playing');

    if (pageErrors.length) {
      console.log('\n--- what the page threw ---');
      for (const e of [...new Set(pageErrors)].slice(0, 8)) console.log(`        ${e}`);
    }

    if (!replayMoved || stalled.length) {
      // "The playhead did not move" has more than one cause, and collapsing
      // them wastes the next reader's night. A realm that will not start
      // through the entry point the product calls, but starts immediately
      // through the engine's own method on the same object, is not a stopped
      // replay — it is an inert override sitting in front of the engine.
      const inert = (observed.revived || []).filter((r) => {
        const tries = Array.isArray(r.viaInstanceProperty) ? r.viaInstanceProperty : [];
        const neverStarted = tries.length > 0 && tries.every((a) => !a.playing);
        return neverStarted && r.viaClassMethod && r.viaClassMethod.playing === true;
      });
      /**
       * Recorded and carried, NOT returned on.
       *
       * The b126 run returned here, so section 3 never executed and the artifact
       * shipped with no `observed.readBack` at all — while `workload.panels[].replay`
       * carried the engine's CONFIGURED `marketSecondsPerWallSecond: 10`, which
       * reads exactly like a read-back to anyone scanning the file. I quoted it as
       * one. A run that fails playback is precisely when the read-back field most
       * needs recording, because "absent" and "not attempted" are different
       * findings and only running the probe separates them.
       */
      playbackFail = inert.length
        ? {
          state: 'SHELL_PLAY_OVERRIDE_INERT',
          why: `${inert.map((r) => r.realm).join(', ')}: play() as installed on the instance started `
            + `nothing across ${inert[0].viaInstanceProperty.length} attempts, while the engine's own `
            + `play on the same object started playback with a live timer. The engine is fine; the `
            + `entry point in front of it is not. Identity of the override is in observed.playIdentity.`,
        }
        : {
          state: 'REPLAY_STOPPED',
          why: 'The playhead stopped, so a read-back of zero is honest and the fault is upstream of the meter. Fix playback at these knobs before grading the rate.',
        };
      console.log(`\n  carrying a playback failure into the reading: ${playbackFail.state}`);
    }

    /* ---- 3. the reading -------------------------------------------------- */
    console.log('\n--- the read-back, in the frame a harness attaches to ---');
    const readBack = await page.evaluate(() => {
      const probe = (w, name) => {
        try {
          const rs = w.chart && w.chart.replaySystem;
          return {
            realm: name,
            type: typeof w.__talariaEffectiveRate,
            value: w.__talariaEffectiveRate,
            gov: w.__talariaSpeedGov
              ? {
                unit: w.__talariaSpeedGov.unit ?? null,
                stepSeconds: w.__talariaSpeedGov.stepSeconds ?? null,
                stepsPerWallSecond: w.__talariaSpeedGov.stepsPerWallSecond ?? null,
                target: w.__talariaSpeedGov.target ?? null,
                effective: w.__talariaSpeedGov.effective ?? null,
              }
              : null,
            engine: rs
              ? {
                stepSeconds: typeof rs.getStepSeconds === 'function' ? rs.getStepSeconds() : null,
                marketPerWall: typeof rs.getMarketSecondsPerWallSecond === 'function'
                  ? rs.getMarketSecondsPerWallSecond() : null,
                stepsPerWall: typeof rs.getTargetStepsPerWallSecond === 'function'
                  ? rs.getTargetStepsPerWallSecond() : null,
                tf: typeof rs.getChartTimeframeSeconds === 'function'
                  ? rs.getChartTimeframeSeconds() : null,
              }
              : null,
          };
        } catch (e) {
          return { realm: name, type: 'unreachable', value: null, gov: null, engine: null, why: String(e && e.message) };
        }
      };
      const out = [probe(window, 'top')];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try {
          out.push(probe(f.contentWindow, f.id || 'panel'));
        } catch (_e) {
          out.push({ realm: f.id || 'panel', type: 'cross-origin', value: null, gov: null, engine: null });
        }
      }
      return out;
    });

    observed.readBack = readBack;
    for (const r of readBack) {
      console.log(`        ${String(r.realm).padEnd(12)} type=${r.type} value=${r.value} unit=${r.gov ? r.gov.unit : '-'} step=${r.gov ? r.gov.stepSeconds : '-'}`);
    }

    const top = readBack.find((r) => r.realm === 'top');
    const present = !!top && top.type === 'number' && Number.isFinite(top.value);
    check(present, '__talariaEffectiveRate reads back a finite number on the harness frame',
      top ? `type=${top.type} value=${top.value}` : 'no top realm');
    if (!present) {
      verdict = fail('PUBLISH_ABSENT',
        'The engine is served and carries ORDER-01B, but nothing readable appears on the frame a harness attaches to. This is the failure that was signed off twice.'
        + (playbackFail ? ` Playback also failed this run (${playbackFail.state}), so the absence is not conclusive on its own.` : ''));
      return;
    }

    check(top.value > 0, 'the reading is a live rate, not a zero placeholder', String(top.value));

    const unit = top.gov ? top.gov.unit : null;
    check(unit === 'market-seconds-per-wall-second',
      'the reading names its unit, and the unit is market seconds per wall second',
      `unit=${unit}`);

    /* The arithmetic. A number that does not equal speed x step is a number
     * from the old meter wearing the new label. Tolerance is wide because this
     * is a delivered rate under a governor, not a setting read back. */
    const stepSeconds = (top.gov && top.gov.stepSeconds) ?? (top.engine && top.engine.stepSeconds) ?? null;
    const expected = Number.isFinite(stepSeconds) ? SPEED * stepSeconds : null;
    const ratio = expected ? top.value / expected : null;
    check(
      ratio !== null && ratio > 0.5 && ratio < 1.5,
      'the reading equals speed x step, within governor tolerance',
      `expected ~${expected} (${SPEED} x ${stepSeconds}s), saw ${top.value}, ratio ${ratio === null ? 'n/a' : ratio.toFixed(3)}`,
    );

    /* The unit change has to be visible, not just declared: at step=TF on a 1m
     * chart the market rate is sixty times the bars/s the old meter reported,
     * so a value that still looks like bars/s is the old meter. */
    const tf = top.engine ? top.engine.tf : null;
    if (Number.isFinite(tf) && tf > 1 && stepSeconds === tf) {
      check(top.value > SPEED * 1.5,
        'the scalar is market seconds, not the bars-per-second it used to be',
        `bars/s would read ~${SPEED}; market-s/wall-s reads ${top.value} on a ${tf}s timeframe`);
    }

    const panels = readBack.filter((r) => r.realm !== 'top');
    const publishing = panels.filter((r) => r.type === 'number' && Number.isFinite(r.value));
    check(panels.length === 0 || publishing.length > 0,
      'panel frames publish too, or there are no panel frames',
      `${publishing.length} of ${panels.length} panel frames`);

    const bad = results.filter((r) => !r.ok);
    // A playback failure outranks a good reading: a rate delivered by three of
    // four realms is not a four-panel rate, however correct the scalar is.
    verdict = playbackFail
      ? fail(playbackFail.state, `${playbackFail.why} The read-back itself was still probed and is in observed.readBack.`)
      : bad.length
        ? fail('PUBLISH_WRONG', `A reading came back and ${bad.length} clause(s) disagreed with it: ${bad.map((b) => b.label).join('; ')}`)
        : { state: 'PUBLISH_CORRECT', why: `read-back ${top.value} market-s/wall-s at speed ${SPEED} x step ${stepSeconds}s, measured over ${observed.window.seconds}s in ${observed.window.slices.length} slices` };
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});

    const artifact = {
      signature: 'TALARIA_ORDER01B_READBACK_CANARY_V1',
      at: new Date().toISOString(),
      condition: { speed: SPEED, step: STEP === null ? 'TF' : `${STEP}s`, stepSeconds: STEP },
      // SEAL-EVIDENCE-01, stated in the artifact so a reader cannot promote the
      // cheap half. Marker presence in the served bytes is a precondition: it
      // says the code shipped, never that it ran. SHELL-PLAY-01 was CARRIED in
      // the bytes and inert in behaviour for a full day, on this same surface.
      evidenceClasses: {
        servedEngineMarkers: 'STATIC_BYTES_PRECONDITION',
        rateReadBack: 'OBSERVED_BEHAVIOUR',
        // Named because these two were confused in the b126 artifact, by me:
        // panels[].replay is what the engine was TOLD and echoed back at arming
        // time; readBack is the field a harness attaches to, probed live.
        workloadReplayFigures: 'CONFIGURED_INTENT_NOT_A_READING',
        playheadAdvance: 'OBSERVED_BEHAVIOUR',
        note: 'A pass requires observed.readBack. Markers present with no reading is ENGINE_PRESENT_BEHAVIOUR_UNOBSERVED, and workload.panels[].replay is configured intent rather than a read-back — neither is a pass.',
        readBackAttempted: 'see observed.readBack; absent means the probe did not run, which is not the same as the field being absent',
      },
      window: observed.window || { seconds: null, note: 'the reading window never opened' },
      runLock: { state: RUN_LOCK.state, pid: process.pid },
      verdict: verdict || { state: 'HARNESS_FAILED', why: 'the canary did not reach a verdict' },
      checks: results,
      observed,
    };
    writeArtifactAtomic(OUT, JSON.stringify(artifact, null, 2));
    console.log(`\n  ${results.filter((r) => r.ok).length}/${results.length} — ${artifact.verdict.state}`);
    console.log(`  artifact ${OUT}`);
    if (artifact.verdict.state !== 'PUBLISH_CORRECT') process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
