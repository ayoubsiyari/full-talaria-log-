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

/** Every realm's bar count and whether it still has a fetch in flight. */
async function realmCensus(page) {
  return page.evaluate(() => {
    const realms = [{ w: window, name: 'top' }];
    for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
      try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
    }
    return realms.map((r) => {
      try {
        const ch = r.w.chart;
        const rs = ch && ch.replaySystem;
        return {
          realm: r.name,
          hasReplay: !!rs,
          rawBars: rs && Array.isArray(rs.fullRawData) ? rs.fullRawData.length : (Array.isArray(ch && ch.data) ? ch.data.length : null),
          panLoading: !!(ch && ch._panLoading),
        };
      } catch (e) { return { realm: r.name, hasReplay: false, rawBars: null, panLoading: false, why: String(e && e.message) }; }
    });
  });
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
    census = await realmCensus(page);
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
    const armedAt = await page.evaluate(() => {
      const realms = [{ w: window, name: 'top' }];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
      }
      return realms.map((r) => {
        try {
          const rs = r.w.chart && r.w.chart.replaySystem;
          if (!rs) return { realm: r.name, reason: 'no replaySystem' };
          const raw = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
          return {
            realm: r.name,
            currentIndex: rs.currentIndex ?? null,
            rawBars: raw,
            fromEnd: raw !== null && rs.currentIndex != null ? raw - 1 - rs.currentIndex : null,
            playing: !!rs.isPlaying,
          };
        } catch (e) { return { realm: r.name, reason: String(e && e.message) }; }
      });
    });
    observed.armedAt = armedAt;
    console.log('        position after arming:');
    for (const a of armedAt) {
      console.log(`          ${String(a.realm).padEnd(10)} index ${a.currentIndex} of ${a.rawBars} (${a.fromEnd} bars from the end) playing=${a.playing}`);
    }

    /* ---- give every realm runway, then start the ones that are not playing --- */
    const prep = await page.evaluate(async ({ runway, speed, step }) => {
      const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
      const realms = [{ w: window, name: 'top' }];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
      }
      const out = [];
      for (const r of realms) {
        const rs = r.w.chart && r.w.chart.replaySystem;
        if (!rs) { out.push({ realm: r.name, state: 'NO_REPLAY_SYSTEM' }); continue; }
        const len = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
        const idx = rs.currentIndex ?? null;
        const before = { rawBars: len, currentIndex: idx, fromEnd: len != null && idx != null ? len - 1 - idx : null, playing: !!rs.isPlaying };
        let seekedTo = null;
        if (before.fromEnd != null && before.fromEnd < runway && typeof rs.seekTo === 'function') {
          // The product's own seek, not a hand-written index assignment: a realm
          // rewound by poking currentIndex would carry stale animation state.
          seekedTo = Math.max(0, len - 1 - runway);
          try { rs.seekTo(seekedTo); } catch (e) { out.push({ realm: r.name, state: 'SEEK_THREW', why: String(e && e.message) }); }
          await sleepIn(400);
        }
        /**
         * Product path first, always. If `play()` as installed does not start it,
         * that IS the shell-override finding, so it is recorded per realm rather
         * than worked around silently — and only then does the prototype start the
         * realm, so the reading is of four playing panels and the defect is still
         * on the record.
         */
        let startedVia = before.playing ? 'already-playing' : null;
        if (!rs.isPlaying) {
          try { rs.play(); } catch (_e) { /* the silent refusal is the subject */ }
          await sleepIn(800);
          if (rs.isPlaying) startedVia = 'instance-play';
          else {
            const proto = Object.getPrototypeOf(rs);
            if (proto && typeof proto.play === 'function') {
              try { proto.play.call(rs); } catch (_e) { /* ignore */ }
              await sleepIn(800);
              startedVia = rs.isPlaying ? 'prototype-fallback' : 'would-not-start';
            } else startedVia = 'would-not-start';
          }
        }
        const lenAfter = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
        const idxAfter = rs.currentIndex ?? null;
        out.push({
          realm: r.name,
          state: 'PREPARED',
          before,
          seekedTo,
          startedVia,
          after: {
            rawBars: lenAfter,
            currentIndex: idxAfter,
            fromEnd: lenAfter != null && idxAfter != null ? lenAfter - 1 - idxAfter : null,
            playing: !!rs.isPlaying,
            stepSeconds: typeof rs.getStepSeconds === 'function' ? rs.getStepSeconds() : null,
          },
          asked: { speed, step },
        });
      }
      return out;
    }, { runway: RUNWAY_BARS, speed: SPEED, step: STEP });
    observed.prep = prep;

    console.log(`        runway gate (${RUNWAY_BARS} bars) and start path:`);
    for (const p of prep) {
      if (p.state !== 'PREPARED') { console.log(`          ${String(p.realm).padEnd(10)} ${p.state}${p.why ? ` — ${p.why}` : ''}`); continue; }
      console.log(`          ${String(p.realm).padEnd(10)} fromEnd ${p.before.fromEnd} -> ${p.after.fromEnd}`
        + `${p.seekedTo === null ? '' : ` (seeked to ${p.seekedTo})`}  start=${p.startedVia}  playing=${p.after.playing}`);
    }

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
    const truth = await page.evaluate(async ({ sampleMs, sliceMs }) => {
      const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
      const realms = [{ w: window, name: 'top' }];
      for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
        try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
      }
      const head = (w) => {
        try {
          const rs = w.chart && w.chart.replaySystem;
          if (!rs) return null;
          const t = rs.currentTime != null ? rs.currentTime : rs.replayTimestamp;
          return { t: Number(t), playing: !!rs.isPlaying, active: !!rs.isActive };
        } catch (_e) { return null; }
      };
      /** Why a realm is not playing, asked of the engine rather than guessed. */
      const why = (w) => {
        try {
          const rs = w.chart && w.chart.replaySystem;
          if (!rs) return { reason: 'no replaySystem' };
          const raw = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
          return {
            active: !!rs.isActive,
            mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
            currentIndex: rs.currentIndex ?? null,
            rawBars: raw,
            atLastBar: typeof rs._isAtLastLoadedBar === 'function' ? rs._isAtLastLoadedBar() : null,
            noOpAtEnd: typeof rs._playWouldBeNoOpAtSessionEnd === 'function'
              ? rs._playWouldBeNoOpAtSessionEnd() : null,
            subBarMode: typeof rs._isSubBarStepMode === 'function' ? rs._isSubBarStepMode() : null,
            edgeWait: rs._replayForwardEdgeWait ?? null,
            hasMoreRight: !!(w.chart && w.chart._serverCursors && w.chart._serverCursors.hasMoreRight),
            // The remaining ways play() returns without starting anything. A
            // realm that is silently blocked looks exactly like one that
            // refused on end-of-data, and only one of those is about ORDER-01B.
            windowBlocked: !!w.__talariaChartWindowBlocked,
            playStarting: !!rs.isPlayStarting,
            hidden: typeof rs._isReplayPageHidden === 'function' ? rs._isReplayPageHidden() : null,
            timer: !!rs._nextCandleTimer,
            interval: !!rs.playInterval,
            // Which guard in the edge wait declined, rather than that it did.
            edgeWaits: rs._loadedEdgeWaits ?? null,
            probeRetries: rs.edgeProbeRetryCount ?? null,
            panLoading: !!(w.chart && w.chart._panLoading),
            fileId: (w.chart && w.chart.currentFileId) ?? null,
            sessionEnd: typeof rs._getBacktestSessionEndMs === 'function'
              ? rs._getBacktestSessionEndMs() : null,
            playheadAtSessionEnd: (() => {
              try {
                const e = rs._getBacktestSessionEndMs();
                return e == null ? null : !!rs._playheadReachedSessionEnd(e);
              } catch (_e) { return null; }
            })(),
          };
        } catch (e) { return { reason: String(e && e.message) }; }
      };
      const first = realms.map((r) => ({ name: r.name, h: head(r.w) }));
      const t0 = performance.now();
      /**
       * Slices, so a realm that runs for ten seconds and then parks at its edge is
       * distinguishable from one that ran the whole window at half rate. Averaged
       * over one delta those two are the same number.
       */
      const slices = [];
      const sliceCount = Math.max(1, Math.round(sampleMs / sliceMs));
      let prevHeads = realms.map((r) => head(r.w));
      let prevAt = performance.now();
      for (let s = 0; s < sliceCount; s += 1) {
        await sleepIn(sliceMs);
        const now = performance.now();
        const wall = (now - prevAt) / 1000;
        const heads = realms.map((r) => head(r.w));
        slices.push({
          sliceSeconds: +wall.toFixed(2),
          perRealm: realms.map((r, i) => {
            const a = prevHeads[i];
            const b = heads[i];
            const adv = a && b && Number.isFinite(a.t) && Number.isFinite(b.t) ? (b.t - a.t) / 1000 : null;
            return {
              realm: r.name,
              playing: b ? b.playing : null,
              marketSecAdvanced: adv,
              marketPerWall: adv === null ? null : +(adv / wall).toFixed(2),
            };
          }),
        });
        prevHeads = heads;
        prevAt = now;
      }
      const wallSec = (performance.now() - t0) / 1000;
      const rows = realms.map((r, i) => {
        const a = first[i].h;
        const b = head(r.w);
        const advanced = a && b && Number.isFinite(a.t) && Number.isFinite(b.t)
          ? (b.t - a.t) / 1000 : null;
        const moved = advanced !== null && advanced > 0;
        return {
          realm: r.name,
          playingBefore: a ? a.playing : null,
          playingAfter: b ? b.playing : null,
          marketSecAdvanced: advanced,
          marketPerWall: advanced === null ? null : +(advanced / wallSec).toFixed(2),
          // Also for realms that moved and then stopped: the interesting case
          // is a realm that ran to the loaded edge and gave up there.
          diagnosis: (moved && b && b.playing) ? null : why(r.w),
        };
      });
      return { windowSeconds: +wallSec.toFixed(2), sliceSeconds: +(sliceMs / 1000).toFixed(2), rows, slices };
    }, { sampleMs: SAMPLE_MS, sliceMs: SLICE_MS });
    observed.playhead = truth.rows;
    observed.window = { seconds: truth.windowSeconds, sliceSeconds: truth.sliceSeconds, slices: truth.slices };

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
