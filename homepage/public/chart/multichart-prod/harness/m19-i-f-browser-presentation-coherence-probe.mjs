/**
 * M19-I-f real-browser acceptance: presentation coherence during continuous
 * replay with overlays + lower panes (PO feel: candles advance first, then
 * indicators catch up a split second later at high speed).
 *
 * This cell does NOT replace M19-I compute-budget. M1 needs both GREEN.
 *
 * What is measured (presentation, not worker RTT):
 *   At every chart.render() during real replay.play(), sample the committed
 *   price/display bar versus the latest committed indicator series / calc
 *   snapshot for every active indicator. A paint is STALE when price is
 *   presented ahead of matching indicator state. Record:
 *     - stale-frame count / consecutive stale frames
 *     - max / p95 wall-clock catch-up lag (ms)
 *     - max bar-index delta (priceBars − indicatorCommitBars)
 *
 * Gates (60Hz presentation budget):
 *   Prefer: no price frame ahead of matching indicator state.
 *   Hard-fail: human-visible multi-frame delay —
 *     maxConsecutiveStaleFrames ≥ 2  OR  catchUpLagP95Ms > 2 frames (33.33ms)
 *     OR maxBarDelta ≥ 2.
 *   Absolute bound (not slope/ratio alone): catchUpLagMaxMs ≤ 2 frames.
 *
 * Expected build (never from live observation):
 *   M19_EXPECTED_BUILD_ID=20260724b58
 * Deployed assets:
 *   M19_DEPLOYED_ORIGIN=http://127.0.0.1:3000  (proxies /chart/*; synthetic API local)
 *
 * Run:
 *   M19_EXPECTED_BUILD_ID=20260724b58 node m19-i-f-browser-presentation-coherence-probe.mjs
 *   M19_FOCUS=I-F M19_EXPECTED_BUILD_ID=20260724b58 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, normalizeDeployedOrigin } from './serve.mjs';
import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHART_JS_PATH = path.resolve(__dirname, '../../chart.js');
const SERVE_MJS_PATH = path.resolve(__dirname, 'serve.mjs');

const FRAME_MS_60HZ = 1000 / 60;
/** Prefer coherence within one frame; hard-fail multi-frame human-visible lag. */
const CATCH_UP_LAG_P95_MS_MAX = FRAME_MS_60HZ * 2; // ≈33.33
const CATCH_UP_LAG_MAX_MS_MAX = FRAME_MS_60HZ * 2; // absolute bound
const MAX_CONSECUTIVE_STALE_FRAMES = 1; // ≥2 consecutive stale paints ⇒ RED
const MAX_BAR_DELTA = 1; // ≥2 bars behind at a paint ⇒ RED
/** Proposed post-fix (strict): zero stale frames, lag ≤ 1 frame. */
const POST_FIX_CATCH_UP_LAG_P95_MS = FRAME_MS_60HZ;
const POST_FIX_CATCH_UP_LAG_MAX_MS = FRAME_MS_60HZ;
const POST_FIX_MAX_CONSECUTIVE_STALE = 0;
const POST_FIX_MAX_BAR_DELTA = 0;

const PLAY_MS_100X = Math.max(800, Number(process.env.M19_IF_PLAY_MS_100X) || 2_400);
const PLAY_MS_CTRL = Math.max(800, Number(process.env.M19_IF_PLAY_MS_CTRL) || 2_400);
const CTRL_SPEED = Math.max(1, Number(process.env.M19_IF_CTRL_SPEED) || 10);
const START_INDEX_OFFSET = Math.max(2_000, Number(process.env.M19_IF_START_OFFSET) || 4_000);
const MIN_PAINT_SAMPLES = Math.max(30, Number(process.env.M19_IF_MIN_PAINTS) || 40);
const MIN_PRICE_ADVANCES = Math.max(8, Number(process.env.M19_IF_MIN_ADVANCES) || 12);

const DEPLOYED_ORIGIN = (() => {
  try {
    return normalizeDeployedOrigin(process.env.M19_DEPLOYED_ORIGIN);
  } catch (err) {
    throw new Error(`M19-I-f SETUP-FAIL: ${err?.message || err}`);
  }
})();
const DEPLOYED_MODE = Boolean(DEPLOYED_ORIGIN);

function resolveExpectedBuildId() {
  const fromEnv = String(process.env.M19_EXPECTED_BUILD_ID || '').trim();
  if (/^\d{8}b\d+$/.test(fromEnv)) {
    return { expectedBuildId: fromEnv, source: 'env:M19_EXPECTED_BUILD_ID' };
  }
  if (DEPLOYED_MODE) {
    throw new Error(
      'M19-I-f SETUP-FAIL: M19_DEPLOYED_ORIGIN requires explicit M19_EXPECTED_BUILD_ID '
      + '(never infer expected from upstream/browser observation or local checkout).',
    );
  }
  const tryParse = (filePath, patterns, label) => {
    if (!fs.existsSync(filePath)) return null;
    const src = fs.readFileSync(filePath, 'utf8');
    for (const re of patterns) {
      const m = src.match(re);
      if (m && /^\d{8}b\d+$/.test(m[1])) {
        return { expectedBuildId: m[1], source: label };
      }
    }
    return null;
  };
  const fromChart = tryParse(
    CHART_JS_PATH,
    [/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/],
    'chart.js:CHART_ENGINE_BUILD',
  );
  if (fromChart) return fromChart;
  const fromServe = tryParse(
    SERVE_MJS_PATH,
    [/const\s+buildId\s*=\s*['"](\d{8}b\d+)['"]/],
    'serve.mjs:buildId',
  );
  if (fromServe) return fromServe;
  throw new Error(
    'M19-I-f SETUP-FAIL: cannot resolve expected build ID '
    + '(set M19_EXPECTED_BUILD_ID or ensure chart.js CHART_ENGINE_BUILD is present).',
  );
}

const { expectedBuildId: EXPECTED_BUILD_ID, source: EXPECTED_BUILD_SOURCE } = resolveExpectedBuildId();

async function verifyUpstreamDeployedBuild(origin, expectedBuildId) {
  const engineUrl = `${origin}/chart/chart.js`;
  let engineText;
  try {
    const res = await fetch(engineUrl, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', Accept: '*/*' },
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${engineUrl}`);
    engineText = await res.text();
  } catch (err) {
    throw new Error(
      `M19-I-f SETUP-FAIL: upstream deployed engine unobservable at ${engineUrl}: `
      + String(err?.message || err),
    );
  }
  const engineMatch = engineText.match(
    /const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/,
  );
  const upstreamEngineBuild = engineMatch?.[1] || null;
  if (!upstreamEngineBuild) {
    throw new Error(
      `M19-I-f SETUP-FAIL: upstream deployed engine build unobservable in ${engineUrl}.`,
    );
  }
  let upstreamShellBuild = null;
  try {
    const shellRes = await fetch(`${origin}/harness/host.html`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      cache: 'no-store',
      redirect: 'follow',
    });
    if (shellRes.ok) {
      const shellText = await shellRes.text();
      const m = shellText.match(/__TALARIA_CHART_BUILD_ID\s*=\s*['"](\d{8}b\d+)['"]/);
      upstreamShellBuild = m?.[1] || null;
    }
  } catch (_e) {
    upstreamShellBuild = null;
  }
  if (upstreamShellBuild && upstreamShellBuild !== expectedBuildId) {
    throw new Error(
      `M19-I-f SETUP-FAIL: upstream shell build mismatch `
      + `(observed=${upstreamShellBuild}, expected=${expectedBuildId}).`,
    );
  }
  if (upstreamEngineBuild !== expectedBuildId) {
    throw new Error(
      `M19-I-f SETUP-FAIL: upstream engine build mismatch `
      + `(observed=${upstreamEngineBuild}, expected=${expectedBuildId}).`,
    );
  }
  return {
    upstreamObservedBuild: upstreamEngineBuild,
    upstreamEngineBuild,
    upstreamShellBuild,
  };
}

function percentile(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function installPreDocumentHooks() {
  return {
    fn: () => {
      window.__m19ifSink = {
        paints: [],
        commits: [],
        paintCount: 0,
        commitCount: 0,
      };
    },
  };
}

async function setupPresentationMix(page) {
  return page.evaluate(async ({ startOffset }) => {
    const first = await fetch(
      '/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles',
    ).then((r) => r.json());
    const firstBars = Array.isArray(first.candles) ? first.candles : [];
    if (!firstBars.length) return { ok: false, reason: 'first 1m chunk empty' };
    const nextStart = Number(firstBars[firstBars.length - 1].t) + 60_000;
    const second = await fetch(
      `/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles&start_ts=${nextStart}`,
    ).then((r) => r.json());
    const fine = firstBars.concat(Array.isArray(second.candles) ? second.candles : []);
    if (fine.length < 129_000) {
      return { ok: false, reason: `fine feed too short: ${fine.length}` };
    }

    const chart = window.chart;
    const replay = chart && chart.replaySystem;
    if (!chart || !replay) return { ok: false, reason: 'missing chart/replay' };
    if (typeof chart.addIndicator !== 'function') {
      return { ok: false, reason: 'addIndicator missing' };
    }
    if (typeof chart.render !== 'function') {
      return { ok: false, reason: 'chart.render missing' };
    }

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    chart.currentTimeframe = '1m';
    chart.rawData = fine;
    chart.data = fine;
    if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();

    const startIndex = Math.max(
      1_000,
      Math.min(fine.length - startOffset - 200, fine.length - 2_500),
    );

    replay.isActive = true;
    replay.isPlaying = false;
    replay.autoScrollEnabled = true;
    replay.userHasPanned = false;
    replay.playbackMode = 'candle';
    replay.stepTimeframeOverride = null;
    replay.fullRawData = fine;
    replay.fullData = fine;
    replay.rawTimeframe = '1m';
    replay.currentIndex = startIndex;
    replay.sessionStartIndex = 0;
    replay.replayTimestamp = Number(fine[startIndex].t);
    replay.replayStartTimestamp = Number(fine[0].t);
    replay.replayEndTimestamp = Number(fine[fine.length - 1].t);
    replay.tickElapsedMs = 0;
    replay._persistedPlayheadApplied = true;
    if (typeof replay.buildTickPathCache === 'function') replay.buildTickPathCache();
    if (typeof replay.updateChartData === 'function') replay.updateChartData(false);

    // PO feel mix: overlays (bands + multiple MAs) + lower panes (RSI, MACD, Stochastic).
    // addIndicator dedupes by type — use sma/ema/wma for three MA overlays.
    // Distinct from M19-I compute mix (keeps that gate separate).
    const indicatorSpecs = [
      ['sma', { period: 20 }],
      ['ema', { period: 50 }],
      ['wma', { period: 30 }],
      ['bollinger', { period: 20, stdDev: 2 }],
      ['rsi', { period: 14 }],
      ['macd', { fast: 12, slow: 26, signal: 9 }],
      ['stoch', { period: 14, smoothK: 3, smoothD: 3 }],
    ];
    const added = [];
    for (const [type, params] of indicatorSpecs) {
      try {
        const beforeIds = new Set((chart.indicators?.active || []).map((i) => i.id));
        const ind = chart.addIndicator(type, params);
        const after = chart.indicators?.active || [];
        const newOnes = after.filter((i) => !beforeIds.has(i.id));
        added.push({
          type,
          id: ind?.id || (newOnes[0] && newOnes[0].id) || null,
          ok: true,
          reusedExisting: newOnes.length === 0,
          params,
        });
      } catch (err) {
        added.push({ type, id: null, ok: false, error: String(err?.message || err) });
      }
    }

    const refreshed = chart.indicators?.active || [];
    const activeTypes = refreshed.map((ind) => String(ind.type || '').toLowerCase());
    const hasOverlayBand = activeTypes.some((t) => t === 'bollinger' || t === 'bb');
    const maCount = activeTypes.filter((t) => t === 'sma' || t === 'ema' || t === 'wma').length;
    const hasMa = maCount >= 2;
    const hasRsi = activeTypes.includes('rsi');
    const hasMacd = activeTypes.includes('macd');
    const hasStoch = activeTypes.some((t) => t === 'stoch' || t === 'stochastic');
    if (!hasOverlayBand || !hasMa || !hasRsi || !hasMacd || !hasStoch) {
      return {
        ok: false,
        reason: 'presentation indicator mix incomplete',
        added,
        activeTypes,
        hasOverlayBand,
        hasMa,
        maCount,
        hasRsi,
        hasMacd,
        hasStoch,
      };
    }

    const seriesLenFor = (type, pack) => {
      if (!pack) return 0;
      if (Array.isArray(pack)) return pack.length;
      const t = String(type || '').toLowerCase();
      let arr = null;
      if (t === 'rsi') arr = pack.rsi;
      else if (t === 'macd') arr = pack.macd;
      else if (t === 'stoch' || t === 'stochastic') arr = pack.k;
      else if (t === 'bollinger' || t === 'bb') arr = pack.middle || pack.upper;
      else if (t === 'wma' || t === 'sma' || t === 'ema') arr = pack.line || pack.ma;
      else arr = pack.line || pack.ma || pack.upper || pack.middle;
      return Array.isArray(arr) ? arr.length : 0;
    };

    const samplePresentation = () => {
      const priceBars = Array.isArray(chart.data) ? chart.data.length : 0;
      const priceTs = priceBars > 0 ? Number(chart.data[priceBars - 1].t) : null;
      const playhead = chart.replaySystem?.currentIndex ?? null;
      const snap = chart._indCalcSnapshot || null;
      const snapBars = snap && Number.isFinite(snap.barCount) ? snap.barCount : 0;
      const dataMap = chart.indicators?.data || {};
      const perInd = [];
      let minSeriesLen = Infinity;
      for (const ind of (chart.indicators?.active || [])) {
        const t = String(ind.type || '').toLowerCase();
        const len = seriesLenFor(t, dataMap[ind.id]);
        if (len < minSeriesLen) minSeriesLen = len;
        perInd.push({
          id: ind.id,
          type: t,
          seriesLen: len,
          barDelta: priceBars - len,
          calculating: !!ind._calculating,
        });
      }
      if (!Number.isFinite(minSeriesLen)) minSeriesLen = 0;
      // Presentation lag: price display length ahead of committed indicator arrays
      // OR ahead of last successful calc snapshot (whichever is more behind).
      const indCommitBars = Math.min(minSeriesLen, snapBars || minSeriesLen);
      const barDelta = Math.max(0, priceBars - indCommitBars);
      const stale = barDelta > 0;
      return {
        at: performance.now(),
        priceBars,
        priceTs,
        playhead,
        snapBars,
        minSeriesLen,
        indCommitBars,
        barDelta,
        stale,
        workerBusy: !!chart._indicatorWorkerBusy,
        pendingRecalcRaf: chart._replayIndRecalcRaf != null,
        dataVersion: chart.dataVersion ?? null,
        indRenderVersion: chart._indicatorRenderVersion ?? null,
        perInd,
      };
    };

    const sink = window.__m19ifSink;
    if (!sink) return { ok: false, reason: 'm19if sink missing (preDocument failed)' };

    // Test-only wrap: sample at paint (what the user sees). No product semantics change.
    if (!chart.render.__m19ifWrapped) {
      const origRender = chart.render.bind(chart);
      chart.render = function m19ifRender(...args) {
        const ret = origRender(...args);
        try {
          if (sink.sampling) {
            const sample = samplePresentation();
            sink.paints.push(sample);
            sink.paintCount += 1;
          }
        } catch (_e) { /* ignore sample errors */ }
        return ret;
      };
      chart.render.__m19ifWrapped = true;
    }

    if (typeof chart._applyIndicatorWorkerResults === 'function'
      && !chart._applyIndicatorWorkerResults.__m19ifWrapped) {
      const origApply = chart._applyIndicatorWorkerResults.bind(chart);
      chart._applyIndicatorWorkerResults = function m19ifApply(...args) {
        const ret = origApply(...args);
        try {
          if (sink.sampling) {
            sink.commits.push({
              at: performance.now(),
              ...samplePresentation(),
              kind: 'worker-commit',
            });
            sink.commitCount += 1;
          }
        } catch (_e) { /* ignore */ }
        return ret;
      };
      chart._applyIndicatorWorkerResults.__m19ifWrapped = true;
    }

    // Warm sync pass so arrays exist before play measurement.
    try {
      if (typeof chart.recalculateIndicators === 'function') chart.recalculateIndicators();
      else if (typeof chart.scheduleReplayIndicatorRecalc === 'function') {
        chart.scheduleReplayIndicatorRecalc(false);
      }
    } catch (_e) { /* ignore */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const quietStart = performance.now();
    while (chart._indicatorWorkerBusy && performance.now() - quietStart < 5_000) {
      await new Promise((r) => setTimeout(r, 20));
    }

    let engineBuildId = null;
    try {
      const engRes = await fetch('/chart/chart.js', { cache: 'no-store' });
      if (engRes.ok) {
        const engText = await engRes.text();
        const m = engText.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
        engineBuildId = m ? m[1] : null;
      }
    } catch (_e) {
      engineBuildId = null;
    }

    const warm = samplePresentation();
    return {
      ok: true,
      buildId: engineBuildId || window.__TALARIA_CHART_BUILD_ID || null,
      htmlBuildId: window.__TALARIA_CHART_BUILD_ID || null,
      engineBuildId,
      fineCount: fine.length,
      displayBars: Array.isArray(chart.data) ? chart.data.length : null,
      startIndex,
      timeframe: chart.currentTimeframe,
      indicatorCount: (chart.indicators?.active || []).length,
      activeTypes,
      added,
      hasOverlayBand,
      hasMa,
      hasRsi,
      hasMacd,
      hasStoch,
      warmSample: warm,
    };
  }, { startOffset: START_INDEX_OFFSET });
}

async function runPlayCoherence(page, { speed, playMs, label }) {
  return page.evaluate(async ({ speed, playMs, label }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m19ifSink;
    if (!chart || !replay || !sink) return { ok: false, reason: 'missing runtime' };
    if (typeof replay.play !== 'function') return { ok: false, reason: 'replay.play missing' };

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    // Ensure runway for continuous play.
    if (replay.currentIndex > replay.fullRawData.length - 80) {
      replay.currentIndex = Math.max(0, replay.fullRawData.length - 400);
      replay.replayTimestamp = Number(replay.fullRawData[replay.currentIndex].t);
      if (typeof replay.updateChartData === 'function') replay.updateChartData(false);
    }

    // Baseline sync before this speed cell.
    try {
      if (typeof chart.recalculateIndicators === 'function') chart.recalculateIndicators();
    } catch (_e) { /* ignore */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const quietStart = performance.now();
    while (chart._indicatorWorkerBusy && performance.now() - quietStart < 5_000) {
      await new Promise((r) => setTimeout(r, 20));
    }

    sink.paints = [];
    sink.commits = [];
    sink.paintCount = 0;
    sink.commitCount = 0;
    // Reset bridge diagnostics for this speed cell only (no cross-run leak).
    chart._m19ifStats = {
      bridgePasses: 0,
      bridgedSeries: 0,
      uncoveredSeries: 0,
      mergeRejects: 0,
      fullAsyncFallbacks: 0,
    };
    sink.sampling = true;

    replay.speed = speed;
    if (typeof replay.updateSpeedButtonUI === 'function') replay.updateSpeedButtonUI(speed);

    const idx0 = replay.currentIndex;
    const price0 = Array.isArray(chart.data) ? chart.data.length : 0;
    const t0 = performance.now();
    replay.play();
    // Sample isPlaying shortly after play() — some paths set it on the next tick.
    await new Promise((r) => setTimeout(r, 16));
    const playingDuring = !!replay.isPlaying;
    await new Promise((r) => setTimeout(r, Math.max(0, playMs - 16)));
    try { replay.pause(); } catch (_) {}
    // Drain one more paint after pause so catch-up completion can be observed.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    sink.sampling = false;
    const t1 = performance.now();

    const idx1 = replay.currentIndex;
    const price1 = Array.isArray(chart.data) ? chart.data.length : 0;
    const paints = sink.paints.slice();
    const commits = sink.commits.slice();

    // Catch-up lag: for each priceBars level that first appears stale, wall-clock
    // until a later paint at ≥ that priceBars with barDelta === 0.
    const firstStaleAt = new Map(); // priceBars -> first stale paint time
    const catchUpLags = [];
    let consecutive = 0;
    let maxConsecutive = 0;
    let staleFrames = 0;
    let maxBarDelta = 0;
    const barDeltas = [];
    let maxWorkerBusyDuringStale = false;

    for (const p of paints) {
      maxBarDelta = Math.max(maxBarDelta, p.barDelta || 0);
      barDeltas.push(p.barDelta || 0);
      if (p.stale) {
        staleFrames += 1;
        consecutive += 1;
        if (consecutive > maxConsecutive) maxConsecutive = consecutive;
        if (p.workerBusy) maxWorkerBusyDuringStale = true;
        if (!firstStaleAt.has(p.priceBars)) firstStaleAt.set(p.priceBars, p.at);
      } else {
        consecutive = 0;
        if (firstStaleAt.has(p.priceBars)) {
          const start = firstStaleAt.get(p.priceBars);
          catchUpLags.push(Math.max(0, p.at - start));
          firstStaleAt.delete(p.priceBars);
        }
        // Also resolve older open stale levels that have been caught up
        // (price moved on; indicators finally match a prior level).
        for (const [pb, start] of [...firstStaleAt.entries()]) {
          if (pb <= p.priceBars && p.indCommitBars >= pb) {
            catchUpLags.push(Math.max(0, p.at - start));
            firstStaleAt.delete(pb);
          }
        }
      }
    }
    // Unresolved stale levels at end-of-sample: lag = time until sampling ended.
    for (const [, start] of firstStaleAt) {
      catchUpLags.push(Math.max(0, t1 - start));
    }

    const pct = (arr, p) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
      return s[idx];
    };

    return {
      ok: true,
      label,
      speed,
      playMs,
      playingDuring,
      indexDelta: idx1 - idx0,
      priceBarsDelta: price1 - price0,
      elapsedMs: t1 - t0,
      paintCount: paints.length,
      commitCount: commits.length,
      staleFrames,
      maxConsecutiveStaleFrames: maxConsecutive,
      maxBarDelta,
      barDeltaP95: pct(barDeltas, 95),
      barDeltaMax: maxBarDelta,
      catchUpLagMs: {
        n: catchUpLags.length,
        max: catchUpLags.length ? Math.max(...catchUpLags) : 0,
        p95: pct(catchUpLags, 95) ?? 0,
        median: pct(catchUpLags, 50) ?? 0,
        samples: catchUpLags.slice(0, 40),
      },
      workerBusySeenOnStalePaint: maxWorkerBusyDuringStale,
      m19ifStats: chart._m19ifStats
        ? { ...chart._m19ifStats }
        : null,
      sampleHead: paints.slice(0, 3),
      sampleTail: paints.slice(-3),
    };
  }, { speed, playMs, label });
}

function evaluateCoherence(cell, { minAdvances = MIN_PRICE_ADVANCES } = {}) {
  const lag = cell.catchUpLagMs || {};
  const advanced = (cell.indexDelta >= minAdvances || cell.priceBarsDelta >= minAdvances);
  const asserts = {
    playAdvanced: {
      // Prefer seeing isPlaying, but accept measured playhead advance (play may
      // clear isPlaying before the post-play sample on some paths).
      pass: advanced && (cell.playingDuring === true || cell.indexDelta > 0 || cell.priceBarsDelta > 0),
      playingDuring: cell.playingDuring,
      indexDelta: cell.indexDelta,
      priceBarsDelta: cell.priceBarsDelta,
      minAdvances,
    },
    paintSamples: {
      pass: cell.paintCount >= MIN_PAINT_SAMPLES,
      paintCount: cell.paintCount,
      min: MIN_PAINT_SAMPLES,
    },
    consecutiveStaleFrames: {
      pass: (cell.maxConsecutiveStaleFrames || 0) <= MAX_CONSECUTIVE_STALE_FRAMES,
      value: cell.maxConsecutiveStaleFrames,
      limit: MAX_CONSECUTIVE_STALE_FRAMES,
      justification: '≥2 consecutive stale paints at 60Hz is human-visible multi-frame lag (PO feel).',
    },
    catchUpLagP95: {
      pass: Number(lag.p95) <= CATCH_UP_LAG_P95_MS_MAX,
      value: lag.p95,
      limitMs: CATCH_UP_LAG_P95_MS_MAX,
      justification: 'p95 catch-up lag ≤ 2 frames (33.33ms) at 60Hz.',
    },
    catchUpLagMax: {
      pass: Number(lag.max) <= CATCH_UP_LAG_MAX_MS_MAX,
      value: lag.max,
      limitMs: CATCH_UP_LAG_MAX_MS_MAX,
      justification: 'Absolute max catch-up lag ≤ 2 frames (not slope/ratio).',
    },
    barDelta: {
      pass: (cell.maxBarDelta || 0) <= MAX_BAR_DELTA,
      value: cell.maxBarDelta,
      limit: MAX_BAR_DELTA,
      justification: 'Price must not paint ≥2 bars ahead of committed indicator series.',
    },
  };
  const green = Object.values(asserts).every((a) => a.pass === true);
  return { asserts, green };
}

// Switch-OFF discriminator plumbing ONLY (no acceptance-semantics change),
// mirroring the M19-I compute probe's accepted M19_I_KILL_SWITCHES pattern:
// M19_IF_KILL_SWITCHES="__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1" injects the
// named window flags before any engine script so the SAME instrument
// reproduces the legacy RED. Empty (default) = clean GREEN gate run.
const KILL_SWITCHES = String(process.env.M19_IF_KILL_SWITCHES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  let upstreamVerify = null;
  if (DEPLOYED_MODE) {
    upstreamVerify = await verifyUpstreamDeployedBuild(DEPLOYED_ORIGIN, EXPECTED_BUILD_ID);
  }

  const server = await startServer();
  if (DEPLOYED_MODE && !server.deployedMode) {
    throw new Error(
      'M19-I-f SETUP-FAIL: M19_DEPLOYED_ORIGIN set but harness server is not in deployed mode.',
    );
  }
  const browser = await launchBrowser({ headful: false });
  let boot;
  try {
    boot = await bootLayout(browser, server, {
      pair: 'same',
      panels: 1,
      tf: '1m',
      bug: KILL_SWITCHES.length > 0,
      bugSwitches: KILL_SWITCHES.length ? KILL_SWITCHES : null,
      preDocument: installPreDocumentHooks(),
    });
    const { page } = boot;

    const setup = await setupPresentationMix(page);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');

    await sleep(50);

    const high = await runPlayCoherence(page, {
      speed: 100,
      playMs: PLAY_MS_100X,
      label: '100x-primary',
    });
    if (!high?.ok) throw new Error(high?.reason || '100x play coherence failed');

    const ctrl = await runPlayCoherence(page, {
      speed: CTRL_SPEED,
      playMs: PLAY_MS_CTRL,
      label: `${CTRL_SPEED}x-control`,
    });
    if (!ctrl?.ok) throw new Error(ctrl?.reason || 'control play coherence failed');

    const highEval = evaluateCoherence(high, { minAdvances: MIN_PRICE_ADVANCES });
    // Control only needs to prove the loop ran; coherence gates apply to 100x.
    const ctrlEval = evaluateCoherence(ctrl, { minAdvances: Math.max(3, Math.floor(MIN_PRICE_ADVANCES / 3)) });

    // Primary gate is 100x (PO report). Control documents milder lag at low speed.
    const asserts = {
      buildId: {
        pass: setup.buildId === EXPECTED_BUILD_ID,
        value: setup.buildId,
        expected: EXPECTED_BUILD_ID,
      },
      indicatorMix: {
        pass: setup.hasOverlayBand && setup.hasMa && setup.hasRsi && setup.hasMacd && setup.hasStoch,
        activeTypes: setup.activeTypes,
        indicatorCount: setup.indicatorCount,
      },
      highSpeedPlayAdvanced: highEval.asserts.playAdvanced,
      highSpeedPaintSamples: highEval.asserts.paintSamples,
      highSpeedConsecutiveStale: highEval.asserts.consecutiveStaleFrames,
      highSpeedCatchUpLagP95: highEval.asserts.catchUpLagP95,
      highSpeedCatchUpLagMax: highEval.asserts.catchUpLagMax,
      highSpeedBarDelta: highEval.asserts.barDelta,
      controlPlayAdvanced: ctrlEval.asserts.playAdvanced,
      controlPaintSamples: ctrlEval.asserts.paintSamples,
    };

    // When the I-f fix is ON (no kill switches), PO-mix bridge must not hide
    // uncovered/rejected series behind a vacuous snapshot. Diagnostic only —
    // thresholds for lag/stale frames are unchanged.
    if (KILL_SWITCHES.length === 0) {
      const st = high.m19ifStats || {};
      asserts.poMixZeroFallbacks = {
        pass: (st.bridgePasses || 0) > 0
          && (st.uncoveredSeries || 0) === 0
          && (st.mergeRejects || 0) === 0
          && (st.fullAsyncFallbacks || 0) === 0,
        m19ifStats: st,
        note: 'PO mix (sma/ema/wma/bollinger/rsi/macd/stoch) must bridge every series; uncovered/rejects/full-async counted, never hidden.',
      };
    }

    const green = Object.values(asserts).every((a) => a.pass === true);
    const result = {
      ticket: 'M19-I-f',
      scenario: 'overlays(bands+MAs) + RSI/MACD/Stoch panes / real replay.play() / presentation coherence',
      expectedBuildId: EXPECTED_BUILD_ID,
      expectedBuildSource: EXPECTED_BUILD_SOURCE,
      buildId: setup.buildId,
      killSwitchesInjected: KILL_SWITCHES,
      deployedMode: DEPLOYED_MODE,
      assetOrigin: DEPLOYED_MODE ? DEPLOYED_ORIGIN : null,
      upstreamObservedBuild: upstreamVerify?.upstreamObservedBuild || null,
      upstreamEngineBuild: upstreamVerify?.upstreamEngineBuild || null,
      upstreamShellBuild: upstreamVerify?.upstreamShellBuild ?? null,
      provenanceNote: DEPLOYED_MODE
        ? `Product /chart/* assets fetched from deployed origin ${DEPLOYED_ORIGIN}; synthetic /api/* + /harness/* local. Presentation sampled at chart.render().`
        : 'Product /chart/* from local checkout; presentation sampled at chart.render() during real replay.play().',
      setup,
      thresholds: {
        frameMs60Hz: FRAME_MS_60HZ,
        catchUpLagP95MsMax: CATCH_UP_LAG_P95_MS_MAX,
        catchUpLagMaxMsMax: CATCH_UP_LAG_MAX_MS_MAX,
        maxConsecutiveStaleFrames: MAX_CONSECUTIVE_STALE_FRAMES,
        maxBarDelta: MAX_BAR_DELTA,
        proposedPostFix: {
          catchUpLagP95MsMax: POST_FIX_CATCH_UP_LAG_P95_MS,
          catchUpLagMaxMsMax: POST_FIX_CATCH_UP_LAG_MAX_MS,
          maxConsecutiveStaleFrames: POST_FIX_MAX_CONSECUTIVE_STALE,
          maxBarDelta: POST_FIX_MAX_BAR_DELTA,
          note: 'Post-fix prefer zero stale frames and ≤1 frame catch-up at 100x.',
        },
      },
      highSpeed: high,
      controlSpeed: ctrl,
      asserts,
      verdict: green ? 'M19-I-f-GREEN' : 'M19-I-f-RED',
      pass: green,
      note: green
        ? 'Presentation coherent at 100x: no human-visible multi-frame indicator trailing.'
        : 'RED: price paints ahead of committed indicator state during high-speed continuous play (PO feel: indicators catch up after candles).',
      signature: 'Lane 2 / Grok 4.5',
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = green ? 0 : 1;
  } finally {
    try { await boot?.close?.(); } catch (_) {}
    try { await browser.close(); } catch (_) {}
    try { await server.close(); } catch (_) {}
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 2;
});
