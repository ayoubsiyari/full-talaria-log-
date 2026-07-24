/**
 * M19-I-g real-browser acceptance: exact five-MA high-speed presentation lag.
 *
 * Ticket mix (user screenshot): SMA(20) + EMA(20) + WMA(20) + DEMA(20) + TEMA(20).
 * Distinct from M19-I-f PO-mix (SMA/EMA/WMA/Bollinger/RSI/MACD/Stoch) — that gate
 * staying GREEN is NOT proof for this mix and must not force a RED here.
 *
 * Discriminates:
 *   - temporal presentation lag (committed tip / geometry behind newest price bar)
 *   - mathematical vertical smoothing (MA tip ≠ close, but tip is fresh for current bars)
 *
 * Sampling at every chart.render() during real replay.play():
 *   priceBars/priceTs, per-indicator tipIdx/tipTs/tipVal, fresh expected tip,
 *   seriesLen, indRenderVersion/dataVersion, indicator-layer cache hit, and
 *   whether the drawn tip index matches the newest committed finite point.
 *
 * Speeds:
 *   60x primary (repeated ≥3), 100x stress, 10x control.
 *
 * Expected build (never from live observation alone):
 *   M19_EXPECTED_BUILD_ID=20260724b59
 * Deployed assets:
 *   M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000
 *
 * Run:
 *   M19_EXPECTED_BUILD_ID=20260724b59 M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     node m19-i-g-browser-exact-five-ma-probe.mjs
 *   M19_FOCUS=I-G M19_EXPECTED_BUILD_ID=20260724b59 \
 *     M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
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
const CATCH_UP_LAG_MAX_MS_MAX = FRAME_MS_60HZ * 2;
const MAX_CONSECUTIVE_STALE_FRAMES = 1; // ≥2 consecutive stale paints ⇒ RED
const MAX_BAR_DELTA = 1; // ≥2 bars behind at a paint ⇒ RED
const MAX_TIP_INDEX_DELTA = 1;
const MAX_VALUE_MISMATCH_FRAMES = 1; // ≥2 paints with stale tip values ⇒ RED
const VALUE_EPS_ABS = 1e-6;
const VALUE_EPS_REL = 1e-8;

/** Proposed post-fix (strict): zero temporal stale frames, lag ≤ 1 frame. */
const POST_FIX_CATCH_UP_LAG_P95_MS = FRAME_MS_60HZ;
const POST_FIX_CATCH_UP_LAG_MAX_MS = FRAME_MS_60HZ;
const POST_FIX_MAX_CONSECUTIVE_STALE = 0;
const POST_FIX_MAX_BAR_DELTA = 0;
const POST_FIX_MAX_TIP_INDEX_DELTA = 0;
const POST_FIX_MAX_VALUE_MISMATCH_FRAMES = 0;

// Tick mode (~1 candle/sec at 60x with 72 intra-candle ticks) needs a longer
// window than candle mode to accumulate enough bar advances / paints.
const PLAY_MS_60X = Math.max(800, Number(process.env.M19_IG_PLAY_MS_60X) || 10_000);
const PLAY_MS_100X = Math.max(800, Number(process.env.M19_IG_PLAY_MS_100X) || 6_000);
const PLAY_MS_CTRL = Math.max(800, Number(process.env.M19_IG_PLAY_MS_CTRL) || 10_000);
const CTRL_SPEED = Math.max(1, Number(process.env.M19_IG_CTRL_SPEED) || 10);
const PRIMARY_SPEED = Math.max(1, Number(process.env.M19_IG_PRIMARY_SPEED) || 60);
const STRESS_SPEED = Math.max(1, Number(process.env.M19_IG_STRESS_SPEED) || 100);
const PRIMARY_REPEATS = Math.max(3, Number(process.env.M19_IG_REPEATS) || 3);
const START_INDEX_OFFSET = Math.max(2_000, Number(process.env.M19_IG_START_OFFSET) || 4_000);
const MIN_PAINT_SAMPLES = Math.max(12, Number(process.env.M19_IG_MIN_PAINTS) || 20);
const MIN_PRICE_ADVANCES = Math.max(3, Number(process.env.M19_IG_MIN_ADVANCES) || 6);

const EXACT_MIX = [
  ['sma', { period: 20 }],
  ['ema', { period: 20 }],
  ['wma', { period: 20 }],
  ['dema', { period: 20 }],
  ['tema', { period: 20 }],
];
const EXACT_TYPES = EXACT_MIX.map(([t]) => t);

const DEPLOYED_ORIGIN = (() => {
  try {
    return normalizeDeployedOrigin(process.env.M19_DEPLOYED_ORIGIN);
  } catch (err) {
    throw new Error(`M19-I-g SETUP-FAIL: ${err?.message || err}`);
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
      'M19-I-g SETUP-FAIL: M19_DEPLOYED_ORIGIN requires explicit M19_EXPECTED_BUILD_ID '
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
    'M19-I-g SETUP-FAIL: cannot resolve expected build ID '
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
      `M19-I-g SETUP-FAIL: upstream deployed engine unobservable at ${engineUrl}: `
      + String(err?.message || err),
    );
  }
  const engineMatch = engineText.match(
    /const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/,
  );
  const upstreamEngineBuild = engineMatch?.[1] || null;
  if (!upstreamEngineBuild) {
    throw new Error(
      `M19-I-g SETUP-FAIL: upstream deployed engine build unobservable in ${engineUrl}.`,
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
      `M19-I-g SETUP-FAIL: upstream shell build mismatch `
      + `(observed=${upstreamShellBuild}, expected=${expectedBuildId}).`,
    );
  }
  if (upstreamEngineBuild !== expectedBuildId) {
    throw new Error(
      `M19-I-g SETUP-FAIL: upstream engine build mismatch `
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
      window.__m19igSink = {
        paints: [],
        commits: [],
        paintCount: 0,
        commitCount: 0,
        lastLayerMeta: null,
        prevSample: null,
      };
    },
  };
}

async function setupExactFiveMaMix(page) {
  return page.evaluate(async ({ startOffset, exactMix, exactTypes, valueEpsAbs, valueEpsRel }) => {
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
    // PO default is tick (forming-candle animation). Candle mode hid the
    // I-g freeze-until-commit bug that only shows above ~15x in tick mode.
    replay.playbackMode = 'tick';
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

    // Exact user mix — all period 20. Distinct from M19-I-f PO-mix.
    const added = [];
    for (const [type, params] of exactMix) {
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
          period: Number(ind?.params?.period ?? params.period),
        });
      } catch (err) {
        added.push({ type, id: null, ok: false, error: String(err?.message || err) });
      }
    }

    const refreshed = chart.indicators?.active || [];
    const activeTypes = refreshed.map((ind) => String(ind.type || '').toLowerCase());
    const periodsOk = exactTypes.every((t) => {
      const ind = refreshed.find((x) => String(x.type || '').toLowerCase() === t);
      return ind && Number(ind.params?.period) === 20;
    });
    const mixOk = exactTypes.every((t) => activeTypes.includes(t))
      && activeTypes.length === exactTypes.length
      && periodsOk;
    if (!mixOk) {
      return {
        ok: false,
        reason: 'exact five-MA mix incomplete',
        added,
        activeTypes,
        periodsOk,
        expectedTypes: exactTypes,
      };
    }

    const lineArrayFromPack = (pack) => {
      if (!pack) return null;
      if (Array.isArray(pack)) return pack;
      if (Array.isArray(pack.line)) return pack.line;
      if (Array.isArray(pack.ma)) return pack.ma;
      return null;
    };

    const valuesCloseEnough = (a, b) => {
      if (a == null || b == null) return a == null && b == null;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      const diff = Math.abs(a - b);
      const scale = Math.max(1, Math.abs(a), Math.abs(b));
      return diff <= valueEpsAbs || diff <= scale * valueEpsRel;
    };

    // Fresh expected tip values from current chart.data (math reference only).
    const computeExpectedTips = (bars) => {
      const n = bars.length;
      const closes = new Array(n);
      for (let i = 0; i < n; i++) {
        const c = Number(bars[i]?.c);
        closes[i] = Number.isFinite(c) ? c : null;
      }
      const period = 20;
      const sma = new Array(n).fill(null);
      let sum = 0;
      let valid = 0;
      for (let i = 0; i < n; i++) {
        const v = closes[i];
        if (v != null) { sum += v; valid += 1; }
        if (i >= period) {
          const old = closes[i - period];
          if (old != null) { sum -= old; valid -= 1; }
        }
        if (i >= period - 1 && valid === period) sma[i] = sum / period;
      }
      const emaSeries = (src) => {
        const out = new Array(n).fill(null);
        const k = 2 / (period + 1);
        let prev = null;
        let seedSum = 0;
        let seedCount = 0;
        for (let i = 0; i < n; i++) {
          const v = src[i];
          if (v == null || !Number.isFinite(v)) continue;
          if (prev == null) {
            seedSum += v;
            seedCount += 1;
            if (seedCount === period) {
              prev = seedSum / period;
              out[i] = prev;
            }
          } else {
            prev = (v - prev) * k + prev;
            out[i] = prev;
          }
        }
        return out;
      };
      const ema1 = emaSeries(closes);
      const wma = new Array(n).fill(null);
      const denom = (period * (period + 1)) / 2;
      for (let i = period - 1; i < n; i++) {
        let wsum = 0;
        let ok = true;
        for (let j = 0; j < period; j++) {
          const v = closes[i - j];
          if (v == null) { ok = false; break; }
          wsum += v * (period - j);
        }
        if (ok) wma[i] = wsum / denom;
      }
      // DEMA/TEMA pseudo bars use EMA fallback-to-close seeding (product path).
      const pseudoFrom = (series) => {
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          const v = series[i];
          out[i] = (v != null && Number.isFinite(v)) ? v : closes[i];
        }
        return out;
      };
      const ema2 = emaSeries(pseudoFrom(ema1));
      const dema = ema1.map((e1, i) => {
        const e2 = ema2[i];
        if (e1 == null || e2 == null) return null;
        return 2 * e1 - e2;
      });
      const ema3 = emaSeries(pseudoFrom(ema2));
      const tema = ema1.map((a, i) => {
        const b = ema2[i];
        const c = ema3[i];
        if (a == null || b == null || c == null) return null;
        return 3 * a - 3 * b + c;
      });
      const tipOf = (arr) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i] != null && Number.isFinite(arr[i])) {
            return { idx: i, val: arr[i], ts: Number(bars[i]?.t) || null };
          }
        }
        return { idx: -1, val: null, ts: null };
      };
      return {
        sma: tipOf(sma),
        ema: tipOf(ema1),
        wma: tipOf(wma),
        dema: tipOf(dema),
        tema: tipOf(tema),
      };
    };

    const samplePresentation = (layerMeta) => {
      const priceBars = Array.isArray(chart.data) ? chart.data.length : 0;
      const priceTs = priceBars > 0 ? Number(chart.data[priceBars - 1].t) : null;
      const priceClose = priceBars > 0 ? Number(chart.data[priceBars - 1].c) : null;
      const playhead = chart.replaySystem?.currentIndex ?? null;
      const snap = chart._indCalcSnapshot || null;
      const snapBars = snap && Number.isFinite(snap.barCount) ? snap.barCount : 0;
      const dataMap = chart.indicators?.data || {};
      const expected = priceBars > 0 ? computeExpectedTips(chart.data) : null;
      const prev = sink.prevSample;
      const priceAdvanced = !!(prev && priceBars > (prev.priceBars || 0));
      const perInd = [];
      let minSeriesLen = Infinity;
      let maxTipIndexDelta = 0;
      let maxBarDeltaLocal = 0;
      let valueMismatchCount = 0;
      let tipStagnantCount = 0;
      let geomEndpointBehind = false;
      let anyCalculating = false;

      for (const ind of (chart.indicators?.active || [])) {
        const t = String(ind.type || '').toLowerCase();
        const pack = dataMap[ind.id];
        const line = lineArrayFromPack(pack);
        const seriesLen = Array.isArray(line) ? line.length : (Array.isArray(pack) ? pack.length : 0);
        if (seriesLen < minSeriesLen) minSeriesLen = seriesLen;

        let tipIdx = -1;
        let tipVal = null;
        if (Array.isArray(line)) {
          for (let i = line.length - 1; i >= 0; i--) {
            const v = line[i];
            if (v != null && Number.isFinite(Number(v))) {
              tipIdx = i;
              tipVal = Number(v);
              break;
            }
          }
        }
        const tipTs = tipIdx >= 0 && chart.data[tipIdx] ? Number(chart.data[tipIdx].t) : null;
        const exp = expected && expected[t] ? expected[t] : null;
        const expectedTipVal = exp ? exp.val : null;
        const expectedTipIdx = exp ? exp.idx : -1;
        const tipIndexDelta = tipIdx >= 0 ? Math.max(0, (priceBars - 1) - tipIdx) : Math.max(0, priceBars);
        const barDeltaInd = Math.max(0, priceBars - seriesLen);
        // Fresh expected tip (calibrated at warm). When unreliable, ignore.
        const expectedReliable = sink.expectedReliable !== false;
        const matchesExpected = !expectedReliable
          ? true
          : (expectedTipVal == null
            ? tipVal == null
            : valuesCloseEnough(tipVal, expectedTipVal));
        // On price advance: identical tipVal+tipIdx while close moved is a lag signal.
        // Alone can rare-false on SMA window coincidence — combine with expected or index.
        const prevInd = prev && Array.isArray(prev.perInd)
          ? prev.perInd.find((x) => x.id === ind.id)
          : null;
        const tipStagnant = !!(
          priceAdvanced
          && prevInd
          && tipIdx === prevInd.tipIdx
          && tipVal != null
          && prevInd.tipVal != null
          && valuesCloseEnough(tipVal, prevInd.tipVal)
          && Number.isFinite(priceClose)
          && Number.isFinite(prev.priceClose)
          && !valuesCloseEnough(priceClose, prev.priceClose)
        );
        if (tipStagnant) tipStagnantCount += 1;
        const valueStale = (tipIndexDelta === 0 && expectedReliable && expectedTipVal != null
          && tipVal != null && !matchesExpected)
          || (tipStagnant && (tipIndexDelta > 0 || (expectedReliable && !matchesExpected)));
        const mathLagVsClose = (tipVal != null && Number.isFinite(priceClose))
          ? Math.abs(tipVal - priceClose)
          : null;
        const geomEndIdx = (layerMeta && layerMeta.lastDrawnTipIdxById
          && layerMeta.lastDrawnTipIdxById[ind.id] != null)
          ? layerMeta.lastDrawnTipIdxById[ind.id]
          : tipIdx;
        const geomBehind = (geomEndIdx >= 0 && tipIdx >= 0 && geomEndIdx < tipIdx)
          || (tipStagnant && layerMeta && layerMeta.cacheHit === true);
        if (geomBehind) geomEndpointBehind = true;
        if (valueStale) valueMismatchCount += 1;
        if (ind._calculating) anyCalculating = true;
        maxTipIndexDelta = Math.max(maxTipIndexDelta, tipIndexDelta);
        maxBarDeltaLocal = Math.max(maxBarDeltaLocal, barDeltaInd);

        perInd.push({
          id: ind.id,
          type: t,
          seriesLen,
          tipIdx,
          tipTs,
          tipVal,
          expectedTipIdx,
          expectedTipVal,
          tipIndexDelta,
          barDelta: barDeltaInd,
          matchesExpected,
          tipStagnant,
          valueFresh: !valueStale,
          mathLagVsClose,
          geomEndIdx,
          geomBehind,
          calculating: !!ind._calculating,
        });
      }
      if (!Number.isFinite(minSeriesLen)) minSeriesLen = 0;

      const indCommitBars = Math.min(minSeriesLen, snapBars || minSeriesLen);
      const barDelta = Math.max(0, priceBars - indCommitBars, maxBarDeltaLocal);
      // Temporal stale: length/index/value/geometry behind newest price paint.
      // Mathematical lag alone (tip ≠ close while valueFresh) is NOT temporal stale.
      const temporalStale = barDelta > 0
        || maxTipIndexDelta > 0
        || valueMismatchCount > 0
        || geomEndpointBehind
        || (layerMeta && layerMeta.cacheHit === true && maxTipIndexDelta > 0);

      return {
        at: performance.now(),
        priceBars,
        priceTs,
        priceClose,
        playhead,
        snapBars,
        minSeriesLen,
        indCommitBars,
        barDelta,
        tipIndexDelta: maxTipIndexDelta,
        valueMismatchCount,
        tipStagnantCount,
        geomEndpointBehind,
        temporalStale,
        stale: temporalStale,
        workerBusy: !!chart._indicatorWorkerBusy,
        pendingRecalcRaf: chart._replayIndRecalcRaf != null,
        dataVersion: chart.dataVersion ?? null,
        indRenderVersion: chart._indicatorRenderVersion ?? null,
        layerCacheHit: layerMeta ? !!layerMeta.cacheHit : null,
        layerKey: layerMeta ? layerMeta.key || null : null,
        anyCalculating,
        perInd,
      };
    };

    const sink = window.__m19igSink;
    if (!sink) return { ok: false, reason: 'm19ig sink missing (preDocument failed)' };

    // Test-only wraps: sample at paint + observe indicator-layer cache / drawn tip.
    if (!chart.render.__m19igWrapped) {
      const origRender = chart.render.bind(chart);
      chart.render = function m19igRender(...args) {
        const ret = origRender(...args);
        try {
          if (sink.sampling) {
            const sample = samplePresentation(sink.lastLayerMeta);
            sink.paints.push(sample);
            sink.paintCount += 1;
            sink.prevSample = sample;
          }
        } catch (_e) { /* ignore sample errors */ }
        return ret;
      };
      chart.render.__m19igWrapped = true;
    }

    if (typeof chart.drawIndicatorsOptimized === 'function'
      && !chart.drawIndicatorsOptimized.__m19igWrapped) {
      const origOpt = chart.drawIndicatorsOptimized.bind(chart);
      chart.drawIndicatorsOptimized = function m19igDrawOpt(...args) {
        const keyBefore = chart._indLayerCacheKey;
        // Capture drawn tip indices while the layer is (re)built.
        const drawn = {};
        let capturing = false;
        const origDraw = typeof chart.drawIndicators === 'function'
          ? chart.drawIndicators.bind(chart)
          : null;
        if (origDraw && !chart.drawIndicators.__m19igInnerWrapped) {
          chart.drawIndicators = function m19igDrawInd(...dArgs) {
            capturing = true;
            try {
              const dataMap = chart.indicators?.data || {};
              for (const ind of (chart.indicators?.active || [])) {
                const line = lineArrayFromPack(dataMap[ind.id]);
                if (!Array.isArray(line)) continue;
                let tip = -1;
                for (let i = line.length - 1; i >= 0; i--) {
                  if (line[i] != null && Number.isFinite(Number(line[i]))) {
                    tip = i;
                    break;
                  }
                }
                drawn[ind.id] = tip;
              }
            } catch (_e) { /* ignore */ }
            try {
              return origDraw(...dArgs);
            } finally {
              capturing = false;
            }
          };
          chart.drawIndicators.__m19igInnerWrapped = true;
        }
        const ret = origOpt(...args);
        const keyAfter = chart._indLayerCacheKey;
        const cacheHit = keyBefore != null && keyBefore === keyAfter;
        sink.lastLayerMeta = {
          cacheHit,
          key: keyAfter || keyBefore || null,
          lastDrawnTipIdxById: drawn,
          capturingSawDraw: Object.keys(drawn).length > 0,
        };
        return ret;
      };
      chart.drawIndicatorsOptimized.__m19igWrapped = true;
    }

    if (typeof chart._applyIndicatorWorkerResults === 'function'
      && !chart._applyIndicatorWorkerResults.__m19igWrapped) {
      const origApply = chart._applyIndicatorWorkerResults.bind(chart);
      chart._applyIndicatorWorkerResults = function m19igApply(...args) {
        const ret = origApply(...args);
        try {
          if (sink.sampling) {
            sink.commits.push({
              at: performance.now(),
              ...samplePresentation(sink.lastLayerMeta),
              kind: 'worker-commit',
            });
            sink.commitCount += 1;
          }
        } catch (_e) { /* ignore */ }
        return ret;
      };
      chart._applyIndicatorWorkerResults.__m19igWrapped = true;
    }

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

    const warm = samplePresentation(null);
    // Calibrate expected-tip math against post-sync committed tips. If any MA
    // diverges at quiet warm, disable expected-value gating (avoid false RED).
    const expectedReliable = Array.isArray(warm.perInd)
      && warm.perInd.length === exactTypes.length
      && warm.perInd.every((p) => p.matchesExpected !== false
        && (p.tipIndexDelta || 0) === 0
        && (p.barDelta || 0) === 0);
    sink.expectedReliable = expectedReliable;
    // Re-tag warm with calibration flag for evidence.
    warm.expectedReliable = expectedReliable;

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
      exactMixOk: true,
      periodsOk,
      expectedReliable,
      warmSample: warm,
    };
  }, {
    startOffset: START_INDEX_OFFSET,
    exactMix: EXACT_MIX,
    exactTypes: EXACT_TYPES,
    valueEpsAbs: VALUE_EPS_ABS,
    valueEpsRel: VALUE_EPS_REL,
  });
}

async function runPlayCoherence(page, { speed, playMs, label }) {
  return page.evaluate(async ({ speed, playMs, label }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m19igSink;
    if (!chart || !replay || !sink) return { ok: false, reason: 'missing runtime' };
    if (typeof replay.play !== 'function') return { ok: false, reason: 'replay.play missing' };

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    if (replay.currentIndex > replay.fullRawData.length - 80) {
      replay.currentIndex = Math.max(0, replay.fullRawData.length - 400);
      replay.replayTimestamp = Number(replay.fullRawData[replay.currentIndex].t);
      if (typeof replay.updateChartData === 'function') replay.updateChartData(false);
    }

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
    sink.lastLayerMeta = null;
    sink.prevSample = null;
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
    await new Promise((r) => setTimeout(r, 16));
    const playingDuring = !!replay.isPlaying;
    await new Promise((r) => setTimeout(r, Math.max(0, playMs - 16)));
    try { replay.pause(); } catch (_) {}
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    sink.sampling = false;
    const t1 = performance.now();

    const idx1 = replay.currentIndex;
    const price1 = Array.isArray(chart.data) ? chart.data.length : 0;
    const paints = sink.paints.slice();
    const commits = sink.commits.slice();

    const firstStaleAt = new Map();
    const catchUpLags = [];
    let consecutive = 0;
    let maxConsecutive = 0;
    let staleFrames = 0;
    let maxBarDelta = 0;
    let maxTipIndexDelta = 0;
    let valueMismatchFrames = 0;
    let geomBehindFrames = 0;
    let layerCacheHitStaleFrames = 0;
    let mathLagOnlyFrames = 0;
    const barDeltas = [];
    const tipIndexDeltas = [];
    let maxWorkerBusyDuringStale = false;
    const staleByType = { sma: 0, ema: 0, wma: 0, dema: 0, tema: 0 };

    for (const p of paints) {
      maxBarDelta = Math.max(maxBarDelta, p.barDelta || 0);
      maxTipIndexDelta = Math.max(maxTipIndexDelta, p.tipIndexDelta || 0);
      barDeltas.push(p.barDelta || 0);
      tipIndexDeltas.push(p.tipIndexDelta || 0);
      if ((p.valueMismatchCount || 0) > 0) valueMismatchFrames += 1;
      if (p.geomEndpointBehind) geomBehindFrames += 1;
      if (p.layerCacheHit && p.temporalStale) layerCacheHitStaleFrames += 1;

      // Math-only: tip ≠ close on every MA, but temporally fresh.
      if (!p.temporalStale && Array.isArray(p.perInd) && p.perInd.length) {
        const allMathLag = p.perInd.every((ind) => (
          ind.valueFresh
          && ind.mathLagVsClose != null
          && ind.mathLagVsClose > 0
        ));
        if (allMathLag) mathLagOnlyFrames += 1;
      }

      if (Array.isArray(p.perInd)) {
        for (const ind of p.perInd) {
          if (!ind.valueFresh || (ind.tipIndexDelta || 0) > 0 || (ind.barDelta || 0) > 0) {
            if (staleByType[ind.type] != null) staleByType[ind.type] += 1;
          }
        }
      }

      if (p.stale || p.temporalStale) {
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
        for (const [pb, start] of [...firstStaleAt.entries()]) {
          if (pb <= p.priceBars && p.indCommitBars >= pb && (p.tipIndexDelta || 0) === 0) {
            catchUpLags.push(Math.max(0, p.at - start));
            firstStaleAt.delete(pb);
          }
        }
      }
    }
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
      maxTipIndexDelta,
      valueMismatchFrames,
      geomBehindFrames,
      layerCacheHitStaleFrames,
      mathLagOnlyFrames,
      staleByType,
      barDeltaP95: pct(barDeltas, 95),
      barDeltaMax: maxBarDelta,
      tipIndexDeltaP95: pct(tipIndexDeltas, 95),
      catchUpLagMs: {
        n: catchUpLags.length,
        max: catchUpLags.length ? Math.max(...catchUpLags) : 0,
        p95: pct(catchUpLags, 95) ?? 0,
        median: pct(catchUpLags, 50) ?? 0,
        samples: catchUpLags.slice(0, 40),
      },
      workerBusySeenOnStalePaint: maxWorkerBusyDuringStale,
      m19ifStats: chart._m19ifStats ? { ...chart._m19ifStats } : null,
      sampleHead: paints.slice(0, 2),
      sampleTail: paints.slice(-2),
      // Compact evidence: first temporal-stale paint if any.
      firstTemporalStale: paints.find((p) => p.temporalStale) || null,
    };
  }, { speed, playMs, label });
}

function evaluateCoherence(cell, { minAdvances = MIN_PRICE_ADVANCES } = {}) {
  const lag = cell.catchUpLagMs || {};
  const advanced = (cell.indexDelta >= minAdvances || cell.priceBarsDelta >= minAdvances);
  const asserts = {
    playAdvanced: {
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
      justification: '≥2 consecutive temporal-stale paints at 60Hz is human-visible multi-frame lag.',
    },
    catchUpLagP95: {
      pass: Number(lag.p95) <= CATCH_UP_LAG_P95_MS_MAX,
      value: lag.p95,
      limitMs: CATCH_UP_LAG_P95_MS_MAX,
      justification: 'p95 temporal catch-up lag ≤ 2 frames (33.33ms) at 60Hz.',
    },
    catchUpLagMax: {
      pass: Number(lag.max) <= CATCH_UP_LAG_MAX_MS_MAX,
      value: lag.max,
      limitMs: CATCH_UP_LAG_MAX_MS_MAX,
      justification: 'Absolute max temporal catch-up lag ≤ 2 frames.',
    },
    barDelta: {
      pass: (cell.maxBarDelta || 0) <= MAX_BAR_DELTA,
      value: cell.maxBarDelta,
      limit: MAX_BAR_DELTA,
      justification: 'Price must not paint ≥2 bars ahead of committed indicator series length.',
    },
    tipIndexDelta: {
      pass: (cell.maxTipIndexDelta || 0) <= MAX_TIP_INDEX_DELTA,
      value: cell.maxTipIndexDelta,
      limit: MAX_TIP_INDEX_DELTA,
      justification: 'Latest finite indicator tip index must track newest price bar (not length-only).',
    },
    valueMismatchFrames: {
      pass: (cell.valueMismatchFrames || 0) <= MAX_VALUE_MISMATCH_FRAMES,
      value: cell.valueMismatchFrames,
      limit: MAX_VALUE_MISMATCH_FRAMES,
      justification: 'Committed tip value must match fresh expected tip for current bars (≥2 mismatch paints ⇒ RED).',
    },
  };
  const green = Object.values(asserts).every((a) => a.pass === true);
  return { asserts, green };
}

// Switch-OFF discriminator plumbing ONLY (no product implementation).
// M19_IG_KILL_SWITCHES="__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1" injects
// named window flags before engine scripts so the same instrument can show
// legacy async catch-up if product later scopes the bridge to this mix.
const KILL_SWITCHES = String(process.env.M19_IG_KILL_SWITCHES || '')
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
      'M19-I-g SETUP-FAIL: M19_DEPLOYED_ORIGIN set but harness server is not in deployed mode.',
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

    const setup = await setupExactFiveMaMix(page);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');

    await sleep(50);

    const primaryRuns = [];
    for (let i = 0; i < PRIMARY_REPEATS; i++) {
      const cell = await runPlayCoherence(page, {
        speed: PRIMARY_SPEED,
        playMs: PLAY_MS_60X,
        label: `${PRIMARY_SPEED}x-primary-run${i + 1}`,
      });
      if (!cell?.ok) throw new Error(cell?.reason || `${PRIMARY_SPEED}x run ${i + 1} failed`);
      primaryRuns.push(cell);
    }

    const stress = await runPlayCoherence(page, {
      speed: STRESS_SPEED,
      playMs: PLAY_MS_100X,
      label: `${STRESS_SPEED}x-stress`,
    });
    if (!stress?.ok) throw new Error(stress?.reason || '100x stress failed');

    const ctrl = await runPlayCoherence(page, {
      speed: CTRL_SPEED,
      playMs: PLAY_MS_CTRL,
      label: `${CTRL_SPEED}x-control`,
    });
    if (!ctrl?.ok) throw new Error(ctrl?.reason || 'control play coherence failed');

    const primaryEvals = primaryRuns.map((c) => evaluateCoherence(c, { minAdvances: MIN_PRICE_ADVANCES }));
    const stressEval = evaluateCoherence(stress, { minAdvances: MIN_PRICE_ADVANCES });
    const ctrlEval = evaluateCoherence(ctrl, {
      // 10x tick ≈ 0.17 candles/sec — require at least one bar advance.
      minAdvances: Math.max(1, Math.floor(MIN_PRICE_ADVANCES / 6)),
    });

    const worstPrimary = primaryRuns.reduce((acc, cell, idx) => {
      const score = (cell.staleFrames || 0) * 1000
        + (cell.maxConsecutiveStaleFrames || 0) * 100
        + (cell.maxTipIndexDelta || 0) * 10
        + (cell.valueMismatchFrames || 0);
      if (!acc || score > acc.score) return { cell, eval: primaryEvals[idx], score, run: idx + 1 };
      return acc;
    }, null);

    const asserts = {
      buildId: {
        pass: setup.buildId === EXPECTED_BUILD_ID,
        value: setup.buildId,
        expected: EXPECTED_BUILD_ID,
      },
      indicatorMix: {
        pass: setup.exactMixOk === true && setup.periodsOk === true,
        activeTypes: setup.activeTypes,
        indicatorCount: setup.indicatorCount,
        expectedTypes: EXACT_TYPES,
        note: 'Exact SMA20+EMA20+WMA20+DEMA20+TEMA20 only — not I-f PO-mix.',
      },
      primaryRepeats: {
        pass: primaryRuns.length >= 3 && primaryEvals.every((e) => e.green),
        runs: primaryRuns.length,
        runPass: primaryEvals.map((e) => e.green),
        note: `All ${PRIMARY_SPEED}x primary repeats must pass temporal gates.`,
      },
      primaryPlayAdvanced: worstPrimary.eval.asserts.playAdvanced,
      primaryPaintSamples: worstPrimary.eval.asserts.paintSamples,
      primaryConsecutiveStale: worstPrimary.eval.asserts.consecutiveStaleFrames,
      primaryCatchUpLagP95: worstPrimary.eval.asserts.catchUpLagP95,
      primaryCatchUpLagMax: worstPrimary.eval.asserts.catchUpLagMax,
      primaryBarDelta: worstPrimary.eval.asserts.barDelta,
      primaryTipIndexDelta: worstPrimary.eval.asserts.tipIndexDelta,
      primaryValueMismatchFrames: worstPrimary.eval.asserts.valueMismatchFrames,
      stressPlayAdvanced: stressEval.asserts.playAdvanced,
      stressPaintSamples: stressEval.asserts.paintSamples,
      stressConsecutiveStale: stressEval.asserts.consecutiveStaleFrames,
      stressCatchUpLagP95: stressEval.asserts.catchUpLagP95,
      stressCatchUpLagMax: stressEval.asserts.catchUpLagMax,
      stressBarDelta: stressEval.asserts.barDelta,
      stressTipIndexDelta: stressEval.asserts.tipIndexDelta,
      stressValueMismatchFrames: stressEval.asserts.valueMismatchFrames,
      controlPlayAdvanced: ctrlEval.asserts.playAdvanced,
      controlPaintSamples: ctrlEval.asserts.paintSamples,
    };

    // Diagnostic only when kill switches off — does not force RED from I-f stats.
    if (KILL_SWITCHES.length === 0) {
      const st = worstPrimary.cell.m19ifStats || {};
      asserts.exactMixBridgeDiagnostics = {
        pass: true, // informational; uncovered series feed mechanism notes, not auto-RED
        m19ifStats: st,
        note: 'I-f bridge counters observed on this mix; uncovered/rejects inform Lane 1 scope, do not alone force RED.',
      };
    }

    const green = Object.values(asserts).every((a) => a.pass === true);
    // Mechanism classification helpers for the report (not separate gates).
    const temporalEvidence = {
      primaryWorstRun: worstPrimary.run,
      primaryStaleFrames: worstPrimary.cell.staleFrames,
      primaryMaxConsecutiveStale: worstPrimary.cell.maxConsecutiveStaleFrames,
      primaryMaxBarDelta: worstPrimary.cell.maxBarDelta,
      primaryMaxTipIndexDelta: worstPrimary.cell.maxTipIndexDelta,
      primaryValueMismatchFrames: worstPrimary.cell.valueMismatchFrames,
      primaryGeomBehindFrames: worstPrimary.cell.geomBehindFrames,
      primaryCatchUpLagMs: worstPrimary.cell.catchUpLagMs,
      primaryMathLagOnlyFrames: worstPrimary.cell.mathLagOnlyFrames,
      primaryStaleByType: worstPrimary.cell.staleByType,
      stressStaleFrames: stress.staleFrames,
      stressMaxTipIndexDelta: stress.maxTipIndexDelta,
      stressValueMismatchFrames: stress.valueMismatchFrames,
      stressCatchUpLagMs: stress.catchUpLagMs,
      controlStaleFrames: ctrl.staleFrames,
      controlMaxTipIndexDelta: ctrl.maxTipIndexDelta,
      controlValueMismatchFrames: ctrl.valueMismatchFrames,
    };
    const mathOnlySuspect = green
      && temporalEvidence.primaryMathLagOnlyFrames > 0
      && temporalEvidence.primaryStaleFrames === 0
      && temporalEvidence.stressStaleFrames === 0;

    const result = {
      ticket: 'M19-I-g',
      scenario: 'exact SMA20+EMA20+WMA20+DEMA20+TEMA20 / real replay.play() / temporal vs mathematical lag',
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
        ? `Product /chart/* assets fetched from deployed origin ${DEPLOYED_ORIGIN}; synthetic /api/* + /harness/* local. Presentation sampled at chart.render() with tip-value + geometry checks.`
        : 'Product /chart/* from local checkout; presentation sampled at chart.render() during real replay.play().',
      setup,
      thresholds: {
        frameMs60Hz: FRAME_MS_60HZ,
        catchUpLagP95MsMax: CATCH_UP_LAG_P95_MS_MAX,
        catchUpLagMaxMsMax: CATCH_UP_LAG_MAX_MS_MAX,
        maxConsecutiveStaleFrames: MAX_CONSECUTIVE_STALE_FRAMES,
        maxBarDelta: MAX_BAR_DELTA,
        maxTipIndexDelta: MAX_TIP_INDEX_DELTA,
        maxValueMismatchFrames: MAX_VALUE_MISMATCH_FRAMES,
        proposedPostFix: {
          catchUpLagP95MsMax: POST_FIX_CATCH_UP_LAG_P95_MS,
          catchUpLagMaxMsMax: POST_FIX_CATCH_UP_LAG_MAX_MS,
          maxConsecutiveStaleFrames: POST_FIX_MAX_CONSECUTIVE_STALE,
          maxBarDelta: POST_FIX_MAX_BAR_DELTA,
          maxTipIndexDelta: POST_FIX_MAX_TIP_INDEX_DELTA,
          maxValueMismatchFrames: POST_FIX_MAX_VALUE_MISMATCH_FRAMES,
          note: 'Post-fix prefer zero temporal stale frames and ≤1 frame catch-up at 60x/100x for this exact mix.',
        },
        proposedSwitchOffDiscriminator: {
          env: 'M19_IG_KILL_SWITCHES=__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1',
          expect: 'If product fix is bridge-scoped to this mix, OFF should restore temporal RED (stale tip/value/geometry); ON should stay GREEN. Does not change I-f PO-mix gate.',
        },
      },
      primarySpeed: PRIMARY_SPEED,
      stressSpeed: STRESS_SPEED,
      controlSpeed: CTRL_SPEED,
      primaryRuns,
      highSpeed: worstPrimary.cell,
      stressSpeedCell: stress,
      controlSpeedCell: ctrl,
      temporalEvidence,
      mechanismNote: mathOnlySuspect
        ? 'No temporal presentation lag reproduced; observed tip≠close is mathematical MA smoothing with fresh tips.'
        : (green
          ? 'No temporal presentation lag at 60x/100x for this exact mix under tip-value + geometry sampling.'
          : 'Temporal presentation lag evidenced: committed tip index/value and/or geometry behind newest price paint at high speed.'),
      asserts,
      verdict: green ? 'M19-I-g-GREEN' : 'M19-I-g-RED',
      pass: green,
      note: green
        ? 'Exact five-MA mix presentation coherent at 60x (×3) and 100x stress; mathematical smoothing alone is not RED.'
        : 'RED: price paints temporally ahead of exact five-MA committed tip/value/geometry during high-speed continuous play.',
      doesNotSupersede: 'M19-I-f PO-mix gate remains standing and separate.',
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
