#!/usr/bin/env node
/**
 * REPLAY-MODE-TRUTH-V1 — tests 1, 2 and 3 of the tick-animation branch
 * (ruling 606defe033, `CONF-04`), in one session because they share a boot.
 *
 * TEST 1 — mode truth. Reads `getPlaybackMode()` and `getPlaybackLoopKind()` from the
 *   running instance on the host and each panel, at play-start, two minutes and ten.
 *   Any panel in 'tick' while the host is in 'candle' is a P0 and ends the test.
 *
 * TEST 0 — what mode did MY EARLIER RUNS use? Free, and it comes first: the mode is
 *   read BEFORE anything is set. The harness has never called setPlaybackMode, and
 *   `getPlaybackMode()` returns 'tick' for anything that is not exactly 'candle', so
 *   every measurement I have published may have been taken in tick mode. That is either
 *   a caveat on my own decay finding or the finding itself.
 *
 * TEST 2 — recalc cadence. Counts `_scheduleReplayIndicatorRecalc` per advanced candle,
 *   per realm. Candle mode should be ~1. Near frame rate confirms the multiplier.
 *
 * TEST 3 — does recalc cost grow with bars. The same wrapper times every call, so the
 *   duration distribution at minute two is compared with minute fifteen — a distribution
 *   rather than "one recalc", which is cheaper to trust.
 *
 * MEAS-02 per gauge:
 *   - mode/loopKind: read from the live instance, per realm. Authoritative for what the
 *     product thinks it is doing. `getPlaybackLoopKind()` returns null when the instance
 *     is inactive or not playing, so null is reported as null, never as 'candle'.
 *   - recalc count: every call to that one method in that realm. Blind to work the
 *     recalc defers to a worker (the worker onmessage cost lands elsewhere).
 *   - recalc ms: synchronous wall time inside the method, so it includes the immediate
 *     path and excludes anything the scheduler defers to a later frame.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';
import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads mode truth out of a realm without changing anything. */
function readModeSource() {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs) return { hasReplay: false };
  const safe = (fn) => { try { return fn(); } catch (e) { return `ERR:${String(e?.message || e).slice(0, 60)}`; } };
  return {
    hasReplay: true,
    realm: `${location.pathname}${location.search}`.slice(-60),
    rawPlaybackMode: rs.playbackMode === undefined ? '<undefined>'
      : rs.playbackMode === null ? '<null>' : String(rs.playbackMode),
    getPlaybackMode: safe(() => (typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : '<no accessor>')),
    getPlaybackLoopKind: safe(() => (typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : '<no accessor>')),
    shouldUseTickAnimation: safe(() => (typeof rs._shouldUseTickAnimation === 'function' ? rs._shouldUseTickAnimation() : '<no accessor>')),
    tickAnimationEnabled: rs.tickAnimationEnabled === undefined ? '<undefined>' : !!rs.tickAnimationEnabled,
    isActive: !!rs.isActive,
    isPlaying: !!rs.isPlaying,
    isPlayStarting: !!rs.isPlayStarting,
    animatingCandle: !!rs.animatingCandle,
    hasPlayInterval: rs.playInterval != null,
    hasTickInterval: rs.tickInterval != null,
    fastMode: !!rs.fastMode,
    speed: rs.speed ?? null,
    replayIndex: rs.currentIndex ?? null,
    indicators: ((window.chart.indicators && window.chart.indicators.active) || []).length,
    timeframe: window.chart.currentTimeframe || null,
  };
}

/**
 * MIN_CANDLES_FOR_CADENCE — a cadence is recalcs DIVIDED BY advanced candles, so a window that
 * advanced nothing has no cadence, and a window whose playhead moved BACKWARDS (a re-seek) has a
 * negative denominator. Both produce numbers that look like measurements and are not: the tick
 * run at 03:36 reported a mean of 41.87 recalcs/candle from 55 zero-denominator and 13
 * negative-denominator windows out of 84. Windows below this floor are excluded and counted, so
 * the artifact says "not measurable" instead of quoting arithmetic on a broken denominator.
 */
const MIN_CANDLES_FOR_CADENCE = 5;

/** Sets a playback mode in a realm and reports what the instance says afterwards. */
function setModeSource({ mode, restartPlayback }) {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs || typeof rs.setPlaybackMode !== 'function') return { set: false, reason: 'no setPlaybackMode' };
  const before = typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null;
  try {
    rs.setPlaybackMode(mode, { restartPlayback });
  } catch (e) {
    return { set: false, error: String(e?.message || e).slice(0, 120), before };
  }
  return {
    set: true,
    requested: mode,
    restartPlayback,
    before,
    after: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKindAfter: typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    rawAfter: String(rs.playbackMode),
  };
}

/** Tests 2 and 3: count and time every recalc in this realm. */
function recalcCounterSource() {
  if (window.__rmt) return { already: true };
  const rs = window.chart && window.chart.replaySystem;
  const proto = rs && Object.getPrototypeOf(rs);
  const state = {
    realm: `${location.pathname}${location.search}`.slice(-60),
    wrapped: false,
    calls: 0,
    totalMs: 0,
    durations: [],
    startIndex: rs && rs.currentIndex != null ? rs.currentIndex : null,
  };
  window.__rmt = state;
  for (const holder of new Set([rs, proto].filter(Boolean))) {
    const fn = holder._scheduleReplayIndicatorRecalc;
    if (typeof fn !== 'function' || fn.__rmtWrapped) continue;
    const wrap = function rmtWrappedRecalc(...args) {
      const t0 = performance.now();
      try { return fn.apply(this, args); } finally {
        const dt = performance.now() - t0;
        state.calls += 1;
        state.totalMs += dt;
        state.durations.push(dt);
        if (state.durations.length > 3_000) state.durations.splice(0, 1_500);
      }
    };
    wrap.__rmtWrapped = true;
    try { holder._scheduleReplayIndicatorRecalc = wrap; state.wrapped = true; } catch { /* frozen */ }
  }
  state.readAndReset = () => {
    const d = state.durations.slice().sort((a, b) => a - b);
    const rsNow = window.chart && window.chart.replaySystem;
    const out = {
      realm: state.realm,
      wrapped: state.wrapped,
      calls: state.calls,
      windowSamples: d.length,
      meanMs: d.length ? +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(4) : null,
      p50Ms: d.length ? +d[Math.floor(d.length * 0.5)].toFixed(4) : null,
      p95Ms: d.length ? +d[Math.floor(d.length * 0.95)].toFixed(4) : null,
      maxMs: d.length ? +d[d.length - 1].toFixed(4) : null,
      replayIndex: rsNow && rsNow.currentIndex != null ? rsNow.currentIndex : null,
      residentBars: Array.isArray(window.chart && window.chart.data) ? window.chart.data.length : null,
      mode: rsNow && typeof rsNow.getPlaybackMode === 'function' ? rsNow.getPlaybackMode() : null,
      loopKind: rsNow && typeof rsNow.getPlaybackLoopKind === 'function' ? rsNow.getPlaybackLoopKind() : null,
    };
    state.durations.length = 0;
    return out;
  };
  return { wrapped: state.wrapped, realm: state.realm };
}

async function everyRealm(page, fn, arg) {
  const rows = [];
  for (const frame of page.frames()) {
    try {
      const r = arg === undefined ? await frame.evaluate(fn) : await frame.evaluate(fn, arg);
      if (r) rows.push({ url: frame.url().slice(-60), ...r });
    } catch (e) {
      rows.push({ url: frame.url().slice(-60), error: String(e?.message || e).slice(0, 140) });
    }
  }
  return rows;
}

/** The P0 check: any panel in tick while the host is in candle. */
export function gradeModeAgreement(rows) {
  const withReplay = rows.filter((r) => r.hasReplay);
  const host = withReplay[0] || null;
  const peers = withReplay.slice(1);
  const disagreeing = peers.filter((p) => p.getPlaybackMode !== host?.getPlaybackMode);
  const tickWhileHostCandle = host?.getPlaybackMode === 'candle'
    ? peers.filter((p) => p.getPlaybackMode === 'tick')
    : [];
  const loopKinds = withReplay.map((r) => r.getPlaybackLoopKind);
  return {
    realmsWithReplay: withReplay.length,
    hostMode: host?.getPlaybackMode ?? null,
    hostLoopKind: host?.getPlaybackLoopKind ?? null,
    panelModes: peers.map((p) => p.getPlaybackMode),
    panelLoopKinds: peers.map((p) => p.getPlaybackLoopKind),
    allAgreeOnMode: disagreeing.length === 0,
    tickWhileHostCandleCount: tickWhileHostCandle.length,
    p0: tickWhileHostCandle.length > 0,
    loopKindDisagreesWithMode: withReplay.filter((r) => r.getPlaybackLoopKind
      && r.getPlaybackLoopKind !== r.getPlaybackMode).map((r) => ({
      realm: r.realm, mode: r.getPlaybackMode, loopKind: r.getPlaybackLoopKind,
    })),
    loopKinds,
  };
}

export async function runReplayModeTruth({
  minutes = 16, speed = 60, selectAfterPlay = false, indicators = 2, outPath = null,
  /**
   * Which mode to select. Candle answered tests 1-3 at 01:00; `tick` runs the same cadence and
   * cost measurement in the mode that has never been measured, where the per-bar cost is 20x
   * and unattributed. The mode is verified as held after settling, because the V9 React layer
   * re-asserts its own mode onto the instance on a 250 ms poller.
   */
  setMode = 'candle',
} = {}) {
  const indicatorList = indicators === 0 ? [] : PO_TWO_INDICATORS;
  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: indicatorList,
    placeOrder: false,
  });
  const report = {
    signature: 'REPLAY-MODE-TRUTH-V1',
    startedAtIso: new Date().toISOString(),
    ruling: '606defe033 (CONF-04)',
    plan: { minutes, speed, selectAfterPlay, indicators },
    conf01: { compliant: conf01?.compliant, failed: conf01?.failed },
    checkpoints: [],
    recalcSamples: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return { scriptVersion: s ? s[1] : null };
    }).catch(() => null);

    // TEST 0 — the mode the harness has been using all along, read before anything is set.
    const asFound = await everyRealm(page, readModeSource);
    report.test0_asFoundBeforeAnySet = {
      rows: asFound,
      grade: gradeModeAgreement(asFound),
      note: 'the harness has never called setPlaybackMode, so this is the mode every prior measurement of mine was taken in',
    };
    const g0 = report.test0_asFoundBeforeAnySet.grade;
    console.error(`[rmt] build=${report.build?.scriptVersion} TEST0 as-found: host=${g0.hostMode}/${g0.hostLoopKind} panels=${JSON.stringify(g0.panelModes)} loopKinds=${JSON.stringify(g0.panelLoopKinds)}`);
    console.error(`[rmt] TEST0 raw playbackMode per realm: ${JSON.stringify(asFound.filter((r) => r.hasReplay).map((r) => r.rawPlaybackMode))} shouldUseTickAnimation=${JSON.stringify(asFound.filter((r) => r.hasReplay).map((r) => r.shouldUseTickAnimation))}`);
    save();

    // TEST 1 — select the mode. `restartPlayback` mirrors the drain path when the mode is
    // selected after play has already started.
    report.modeRequested = setMode;
    report.test1_setMode = await everyRealm(page, setModeSource, { mode: setMode, restartPlayback: !selectAfterPlay });
    console.error(`[rmt] TEST1 setPlaybackMode('${setMode}', {restartPlayback:${!selectAfterPlay}}) -> ${JSON.stringify(report.test1_setMode.filter((r) => r.set).map((r) => `${r.before}->${r.after}`))}`);
    await keepConf01Playing(page, speed).catch(() => {});
    await sleep(4_000);
    // Verified, not assumed: a requested mode that did not survive the React poller is a mode
    // this run never ran in, and every number below would be mislabelled.
    report.modeHeldAfterSettle = (await everyRealm(page, readModeSource))
      .filter((r) => r.hasReplay).map((r) => r.getPlaybackMode);
    report.modeVerified = report.modeHeldAfterSettle.length > 0
      && report.modeHeldAfterSettle.every((m) => m === setMode);
    console.error(`[rmt] mode after settle: ${JSON.stringify(report.modeHeldAfterSettle)} verified=${report.modeVerified}`);

    report.instrumented = await everyRealm(page, recalcCounterSource);
    console.error(`[rmt] recalc counter wrapped in ${report.instrumented.filter((r) => r.wrapped).length} realms`);

    const startedAt = Date.now();
    const checkpointAt = [0, 2, 10, minutes - 1].filter((m) => m < minutes);
    let nextCheckpoint = 0;
    let lastRecalc = null;
    while ((Date.now() - startedAt) / 60_000 < minutes) {
      const mins = (Date.now() - startedAt) / 60_000;
      if (nextCheckpoint < checkpointAt.length && mins >= checkpointAt[nextCheckpoint]) {
        const rows = await everyRealm(page, readModeSource);
        const grade = gradeModeAgreement(rows);
        report.checkpoints.push({ atMinutes: +mins.toFixed(2), label: `${checkpointAt[nextCheckpoint]}min`, rows, grade });
        console.error(`[rmt] CHECKPOINT ${checkpointAt[nextCheckpoint]}min: host=${grade.hostMode}/${grade.hostLoopKind} panels=${JSON.stringify(grade.panelModes)} loopKinds=${JSON.stringify(grade.panelLoopKinds)} P0=${grade.p0}`);
        if (grade.p0) {
          report.p0 = {
            found: true,
            atMinutes: +mins.toFixed(2),
            detail: `${grade.tickWhileHostCandleCount} panel(s) in tick while host in candle`,
            rows: rows.filter((r) => r.hasReplay),
          };
          console.error(`[rmt] *** P0: ${report.p0.detail} — ending test 1 per the ruling ***`);
        }
        nextCheckpoint += 1;
        save();
      }

      // Tests 2 and 3: recalc count per advanced candle, and recalc duration over time.
      const recalc = await everyRealm(page, () => (window.__rmt ? window.__rmt.readAndReset() : null));
      const state = await readConf01State(page, { advanceWindowMs: 2_500 }).catch(() => null);
      const totals = recalc.filter((r) => r.calls != null);
      const sample = {
        minutes: +mins.toFixed(2),
        advancingPanels: state?.advancingPanels ?? null,
        perRealm: totals.map((r) => ({
          realm: r.realm, mode: r.mode, loopKind: r.loopKind, callsCumulative: r.calls,
          replayIndex: r.replayIndex, residentBars: r.residentBars,
          recalcMeanMs: r.meanMs, recalcP50Ms: r.p50Ms, recalcP95Ms: r.p95Ms, recalcMaxMs: r.maxMs,
          windowSamples: r.windowSamples,
        })),
      };
      if (lastRecalc) {
        sample.perRealmDelta = totals.map((r) => {
          const prev = lastRecalc.find((p) => p.realm === r.realm);
          const dCalls = prev ? r.calls - prev.calls : null;
          const dBars = prev && r.replayIndex != null && prev.replayIndex != null
            ? r.replayIndex - prev.replayIndex : null;
          return {
            realm: r.realm, mode: r.mode, loopKind: r.loopKind,
        recalcs: dCalls, candlesAdvanced: dBars,
        // Excluded, with the reason kept, rather than divided anyway: a negative dCalls is the
        // counter having been re-installed, and a denominator at or below the floor is a window
        // with no forward progress to divide by.
        cadenceExcludedBecause: (dCalls == null || dBars == null) ? 'no reading'
          : (dCalls < 0 ? 'recalc counter reset'
            : (dBars < 0 ? 'playhead moved backwards (re-seek)'
              : (dBars === 0 ? 'no candle advanced'
                : (dBars < MIN_CANDLES_FOR_CADENCE ? `only ${dBars} candle(s) advanced, below the floor of ${MIN_CANDLES_FOR_CADENCE}` : null)))),
        recalcsPerCandle: (dCalls != null && dCalls >= 0 && dBars >= MIN_CANDLES_FOR_CADENCE)
          ? +(dCalls / dBars).toFixed(2) : null,
          };
        });
        const perCandle = sample.perRealmDelta.map((d) => d.recalcsPerCandle).filter((x) => x != null);
        console.error(`[rmt] ${mins.toFixed(1)}min recalcs/candle=${JSON.stringify(perCandle)} recalcP50=${JSON.stringify(totals.map((r) => r.p50Ms))} bars=${JSON.stringify(totals.map((r) => r.replayIndex))} advancing=${state?.advancingPanels}/4`);
      }
      lastRecalc = totals;
      report.recalcSamples.push(sample);
      save();

      if ((state?.advancingPanels ?? 0) < 4) await keepConf01Playing(page, speed).catch(() => {});
      await sleep(30_000);
    }

    // TEST 3 — recalc cost at minute two versus minute fifteen, from the same wrapper.
    const flat = [];
    for (const s of report.recalcSamples) {
      for (const r of s.perRealm) {
        if (r.recalcP50Ms != null && r.residentBars != null) {
          flat.push({ minutes: s.minutes, realm: r.realm, bars: r.replayIndex ?? r.residentBars, p50: r.recalcP50Ms, mean: r.recalcMeanMs });
        }
      }
    }
    const early = flat.filter((f) => f.minutes <= 3);
    const late = flat.filter((f) => f.minutes >= minutes - 4);
    const avg = (rows, k) => (rows.length ? +(rows.reduce((t, r) => t + r[k], 0) / rows.length).toFixed(4) : null);
    report.test3_recalcCostGrowth = {
      earlyWindowMinutes: '<=3',
      lateWindowMinutes: `>=${minutes - 4}`,
      earlyP50Ms: avg(early, 'p50'),
      lateP50Ms: avg(late, 'p50'),
      changePercent: (avg(early, 'p50') && avg(late, 'p50'))
        ? +(((avg(late, 'p50') - avg(early, 'p50')) / avg(early, 'p50')) * 100).toFixed(1) : null,
      fitVsBars: {
        xUnit: 'ms per 1,000 bars played',
        ...fitTrend(flat.map((f) => ({ hours: f.bars / 1_000, value: f.p50 })),
          { label: 'recalc p50 vs bars', flatBandPerHour: 0.05, minSpanHours: 0 }),
      },
      samples: flat.length,
    };

    // TEST 2 verdict — cadence, averaged over the run per realm.
    const cadence = [];
    for (const s of report.recalcSamples) {
      for (const d of (s.perRealmDelta || [])) {
        if (d.recalcsPerCandle != null) cadence.push({ ...d, minutes: s.minutes });
      }
    }
    const byMode = (m) => cadence.filter((c) => c.mode === m).map((c) => c.recalcsPerCandle);
    const meanOf = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  // Only windows that actually advanced can carry a cadence. Everything else is counted by
  // reason, and if nothing qualifies the answer is NOT MEASURABLE rather than a mean.
  const allDeltas = report.recalcSamples.flatMap((s) => s.perRealmDelta || []);
  const excludedByReason = {};
  for (const d of allDeltas) {
    if (d.cadenceExcludedBecause) {
      const key = d.cadenceExcludedBecause.replace(/\d+/g, 'N');
      excludedByReason[key] = (excludedByReason[key] || 0) + 1;
    }
  }
  const usable = cadence.filter((c) => c.recalcsPerCandle != null);
  report.test2_recalcCadence = {
    usableWindows: usable.length,
    totalWindowRealmPairs: allDeltas.length,
    excludedByReason,
    measurable: usable.length > 0,
    meanRecalcsPerCandle: usable.length ? meanOf(usable.map((c) => c.recalcsPerCandle)) : null,
    meanInCandleMode: meanOf(byMode('candle')),
    meanInTickMode: meanOf(byMode('tick')),
    max: usable.length ? Math.max(...usable.map((c) => c.recalcsPerCandle)) : null,
    expectationInCandleMode: '~1 per advanced candle; near frame rate confirms the multiplier',
    // The rate-based reading survives a frozen bar axis, which the cadence does not: it says how
    // much recalc work happened per SECOND and how much forward progress it bought.
    rateFallback: (() => {
      const first = report.recalcSamples[0];
      const last = report.recalcSamples.at(-1);
      if (!first || !last || last === first) return null;
      const secs = ((last.minutes - first.minutes) * 60) || null;
      if (!secs) return null;
      const per = (r) => {
        const f = (first.perRealm || [])[r];
        const l = (last.perRealm || [])[r];
        if (!f || !l) return null;
        return {
          mode: l.mode,
          loopKind: l.loopKind,
          recalcsTotal: l.callsCumulative - f.callsCumulative,
          candlesAdvancedTotal: l.replayIndex - f.replayIndex,
          recalcsPerSecond: +((l.callsCumulative - f.callsCumulative) / secs).toFixed(2),
        };
      };
      return {
        spanSeconds: +secs.toFixed(0),
        perRealm: [0, 1, 2, 3].map(per).filter(Boolean),
        note: 'recalcs per SECOND against candles advanced in the same span. When bar progress is ~0 this is the only honest way to state the recalc load.',
      };
    })(),
  };

    report.verdict = {
      modeRequested: setMode,
      modeVerifiedInEveryRealm: report.modeVerified,
      test0_modeTheHarnessHasBeenUsing: report.test0_asFoundBeforeAnySet.grade.hostMode,
      test1_p0Found: !!report.p0?.found,
      test1_modeAgreementAtEveryCheckpoint: report.checkpoints.every((c) => c.grade.allAgreeOnMode),
      test1_loopKindDisagreements: report.checkpoints.flatMap((c) => c.grade.loopKindDisagreesWithMode),
      test2_recalcsPerCandle: report.test2_recalcCadence.measurable
        ? report.test2_recalcCadence.meanRecalcsPerCandle
        : "NOT MEASURABLE - no window advanced enough candles to divide by; see excludedByReason and rateFallback",
      test3_recalcCostGrows: report.test3_recalcCostGrowth.fitVsBars.verdict,
      test3_earlyToLateP50: `${report.test3_recalcCostGrowth.earlyP50Ms} -> ${report.test3_recalcCostGrowth.lateP50Ms} ms`,
    };
    console.error(`[rmt] VERDICT ${JSON.stringify(report.verdict, null, 1)}`);
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'indicators') o.indicators = Number(v);
    else if (k === 'select-after-play') o.selectAfterPlay = true;
    else if (k === 'set-mode') o.setMode = v;
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /replay-mode-truth\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runReplayModeTruth(parseArgs(process.argv.slice(2)));
