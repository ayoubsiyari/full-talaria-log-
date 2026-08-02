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
    await sleep(3_000);
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
          if (last) last.playingOnReturn = !!this.isPlaying;
        } catch (_e) { /* ignore */ }
        return r;
      };
      // The refusal is silent, so it has to be caught where it is decided.
      window.__canaryNoOpLog = [];
      const origNoOp = rs._playWouldBeNoOpAtSessionEnd.bind(rs);
      rs._playWouldBeNoOpAtSessionEnd = function patchedNoOp(...a) {
        const answer = origNoOp(...a);
        try {
          const c = this.chart && this.chart._serverCursors;
          window.__canaryNoOpLog.push({
            at: Math.round(performance.now()),
            answer: !!answer,
            index: this.currentIndex,
            len: Array.isArray(this.fullRawData) ? this.fullRawData.length : null,
            cursorsPresent: !!c,
            hasMoreRight: c ? !!c.hasMoreRight : null,
            panLoading: !!(this.chart && this.chart._panLoading),
            subBar: typeof this._isSubBarStepMode === 'function' ? this._isSubBarStepMode() : null,
          });
        } catch (_e) { /* ignore */ }
        return answer;
      };
    });
    const workload = await armHeapCyclePoWorkload(page, {
      playHoldMs: 4_000,
      replaySpeed: SPEED,
      stepSeconds: STEP,
      retainIndicators: true,
    });
    observed.workload = {
      armed: workload.armed,
      observedPlaying: workload.observedPlaying,
      stepRefusals: workload.stepRefusals,
      panels: (workload.perPanel || []).map((p) => ({ id: p.id, replay: p.replay })),
    };
    check(!!workload.armed, 'replay is armed and playing',
      `playing=${workload.observedPlaying}`);
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

    // Let the governor's meter fill: it reports delivery, so it needs delivery.
    // While it fills, watch the playhead directly. The meter is the thing under
    // test, so it cannot also be the evidence that replay was moving: a zero
    // from a stopped replay and a zero from a broken meter are different
    // findings and only the playhead separates them.
    const truth = await page.evaluate(async (sampleMs) => {
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
      await sleepIn(sampleMs);
      const wallSec = (performance.now() - t0) / 1000;
      return realms.map((r, i) => {
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
    }, 8_000);
    observed.playhead = truth;

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
        const before = Number(rs.currentTime != null ? rs.currentTime : rs.replayTimestamp);
        try { rs.play(); } catch (e) { out.push({ realm: r.name, threw: String(e && e.message) }); continue; }
        await sleepIn(1_500);
        const after = Number(rs.currentTime != null ? rs.currentTime : rs.replayTimestamp);
        out.push({
          realm: r.name,
          playing: !!rs.isPlaying,
          timer: !!rs._nextCandleTimer,
          interval: !!rs.playInterval,
          edgeWaits: rs._loadedEdgeWaits ?? null,
          advancedSec: Number.isFinite(before) && Number.isFinite(after)
            ? Math.round((after - before) / 1000) : null,
        });
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

    console.log('\n--- the playhead, measured independently of the meter ---');
    for (const t of truth) {
      console.log(`        ${String(t.realm).padEnd(12)} playing=${t.playingBefore}->${t.playingAfter} advanced=${t.marketSecAdvanced}s  ${t.marketPerWall} market-s/wall-s`);
      if (t.diagnosis) console.log(`        ${' '.repeat(12)} why: ${JSON.stringify(t.diagnosis)}`);
    }
    const topHead = truth.find((t) => t.realm === 'top');
    const replayMoved = !!topHead && Number.isFinite(topHead.marketPerWall) && topHead.marketPerWall > 0;
    check(replayMoved, 'replay actually moved during the reading window',
      topHead ? `${topHead.marketSecAdvanced}s of market time` : 'no top realm');
    const stalled = truth.filter((t) => t.playingBefore === true && t.playingAfter === false);
    check(stalled.length === 0, 'no realm stopped playing during the window',
      stalled.length ? `${stalled.map((s) => `${s.realm} after ${s.marketSecAdvanced}s`).join(', ')}` : 'all realms still playing');

    if (pageErrors.length) {
      console.log('\n--- what the page threw ---');
      for (const e of [...new Set(pageErrors)].slice(0, 8)) console.log(`        ${e}`);
    }

    if (!replayMoved || stalled.length) {
      verdict = fail('REPLAY_STOPPED',
        'The playhead stopped, so a read-back of zero is honest and the fault is upstream of the meter. Fix playback at these knobs before grading the rate.');
      return;
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
        'The engine is served and carries ORDER-01B, but nothing readable appears on the frame a harness attaches to. This is the failure that was signed off twice.');
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
    verdict = bad.length
      ? fail('PUBLISH_WRONG', `A reading came back and ${bad.length} clause(s) disagreed with it: ${bad.map((b) => b.label).join('; ')}`)
      : { state: 'PUBLISH_CORRECT', why: `read-back ${top.value} market-s/wall-s at speed ${SPEED} x step ${stepSeconds}s` };
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});

    const artifact = {
      signature: 'TALARIA_ORDER01B_READBACK_CANARY_V1',
      at: new Date().toISOString(),
      condition: { speed: SPEED, step: STEP === null ? 'TF' : `${STEP}s`, stepSeconds: STEP },
      verdict: verdict || { state: 'HARNESS_FAILED', why: 'the canary did not reach a verdict' },
      checks: results,
      observed,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    console.log(`\n  ${results.filter((r) => r.ok).length}/${results.length} — ${artifact.verdict.state}`);
    console.log(`  artifact ${OUT}`);
    if (artifact.verdict.state !== 'PUBLISH_CORRECT') process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
