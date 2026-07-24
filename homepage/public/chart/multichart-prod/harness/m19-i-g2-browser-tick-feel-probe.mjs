/**
 * M19-I-g2 real-browser acceptance: PO-feel high-speed MA lag (tick mode).
 *
 * Extends the M19-I-g exact five-MA mix with default playbackMode='tick'.
 * It detects both legacy blind spots: same-bar forming-tip freeze and the
 * silent fast-mode transition that removed forming paints at 60x/100x.
 *
 * Discriminates:
 *   A) tip-index temporal lag (I-g style) — still gated, not weakened
 *   B) intra-bar tip-value freeze while forming close moves (fingerprint skip)
 *   C) pure mathematical MA lag (tip fresh for current OHLC, tip ≠ close)
 *
 * Speed ladder:
 *   15x control (PO "perfect" baseline), 60x primary ×≥3, 100x stress.
 *
 * Run:
 *   M19_EXPECTED_BUILD_ID=20260724b59 M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     node m19-i-g2-browser-tick-feel-probe.mjs
 *   M19_FOCUS=I-G2 M19_EXPECTED_BUILD_ID=20260724b59 \
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
const CATCH_UP_LAG_P95_MS_MAX = FRAME_MS_60HZ * 2;
const CATCH_UP_LAG_MAX_MS_MAX = FRAME_MS_60HZ * 2;
const MAX_CONSECUTIVE_STALE_FRAMES = 1;
const MAX_BAR_DELTA = 1;
const MAX_TIP_INDEX_DELTA = 1;
const MAX_VALUE_MISMATCH_FRAMES = 1; // tip-index/value temporal (I-g semantics)

/** Intra-bar freeze feel (smooth tick only): high-speed must not dwarf 15x. */
const MAX_INTRA_BAR_STALE_RATIO = 0.55;
const MAX_CLOSE_DRIFT_WHILE_FROZEN_PER_SEC = 0.012;
const MAX_FEEL_INTENSITY_RATIO_VS_CTRL = 3.0;
/** No selected high-speed cell may silently become commit-only fast mode. */
const MAX_FAST_MODE_SAMPLE_RATIO_AT_PRIMARY = 0.15;

const PLAY_MS_60X = Math.max(800, Number(process.env.M19_IG2_PLAY_MS_60X) || 3_600);
const PLAY_MS_100X = Math.max(800, Number(process.env.M19_IG2_PLAY_MS_100X) || 3_600);
const PLAY_MS_CTRL = Math.max(800, Number(process.env.M19_IG2_PLAY_MS_CTRL) || 4_800);
const CTRL_SPEED = Math.max(1, Number(process.env.M19_IG2_CTRL_SPEED) || 15);
const PRIMARY_SPEED = Math.max(1, Number(process.env.M19_IG2_PRIMARY_SPEED) || 60);
const STRESS_SPEED = Math.max(1, Number(process.env.M19_IG2_STRESS_SPEED) || 100);
const PRIMARY_REPEATS = Math.max(3, Number(process.env.M19_IG2_REPEATS) || 3);
const START_INDEX_OFFSET = Math.max(2_000, Number(process.env.M19_IG2_START_OFFSET) || 4_000);
/** Tick samples (not only chart.render paints) — headless coalesces renders. */
const MIN_TICK_SAMPLES = Math.max(40, Number(process.env.M19_IG2_MIN_TICKS) || 60);
const MIN_PAINT_SAMPLES = Math.max(8, Number(process.env.M19_IG2_MIN_PAINTS) || 12);
const MIN_PRICE_ADVANCES = Math.max(2, Number(process.env.M19_IG2_MIN_ADVANCES) || 3);

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
    throw new Error(`M19-I-g2 SETUP-FAIL: ${err?.message || err}`);
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
      'M19-I-g2 SETUP-FAIL: M19_DEPLOYED_ORIGIN requires explicit M19_EXPECTED_BUILD_ID '
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
    'M19-I-g2 SETUP-FAIL: cannot resolve expected build ID '
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
      `M19-I-g2 SETUP-FAIL: upstream deployed engine unobservable at ${engineUrl}: `
      + String(err?.message || err),
    );
  }
  const engineMatch = engineText.match(
    /const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/,
  );
  const upstreamEngineBuild = engineMatch?.[1] || null;
  if (!upstreamEngineBuild) {
    throw new Error(
      `M19-I-g2 SETUP-FAIL: upstream deployed engine build unobservable in ${engineUrl}.`,
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
      `M19-I-g2 SETUP-FAIL: upstream shell build mismatch `
      + `(observed=${upstreamShellBuild}, expected=${expectedBuildId}).`,
    );
  }
  if (upstreamEngineBuild !== expectedBuildId) {
    throw new Error(
      `M19-I-g2 SETUP-FAIL: upstream engine build mismatch `
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
      window.__m19ig2Sink = {
        paints: [],
        ticks: [],
        commits: [],
        paintCount: 0,
        tickCount: 0,
        commitCount: 0,
        lastLayerMeta: null,
        prevSample: null,
        prevTickSample: null,
        recalcStats: {
          scheduled: 0,
          played: 0,
          skippedSameBar: 0,
          fullOrTail: 0,
        },
      };
    },
  };
}

async function setupExactFiveMaTickMix(page) {
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
    // PO-default path (I-g forced 'candle' and missed mid-bar freeze).
    replay.playbackMode = 'tick';
    replay.tickAnimationEnabled = true;
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
    replay.tickProgress = 0;
    replay.animatingCandle = null;
    replay.fastMode = false;
    replay._persistedPlayheadApplied = true;
    if (typeof replay.buildTickPathCache === 'function') replay.buildTickPathCache();
    if (typeof replay.updateChartData === 'function') replay.updateChartData(false);

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

    const samplePresentation = (layerMeta, prevOverride) => {
      const priceBars = Array.isArray(chart.data) ? chart.data.length : 0;
      const lastBar = priceBars > 0 ? chart.data[priceBars - 1] : null;
      const priceTs = lastBar ? Number(lastBar.t) : null;
      const priceClose = lastBar ? Number(lastBar.c) : null;
      const playhead = chart.replaySystem?.currentIndex ?? null;
      const tickProgress = Number(chart.replaySystem?.tickProgress) || 0;
      const animClose = chart.replaySystem?.animatingCandle
        ? Number(chart.replaySystem.animatingCandle.close)
        : null;
      const formingClose = Number.isFinite(animClose) ? animClose : priceClose;
      const fastMode = !!chart.replaySystem?.fastMode;
      const playbackMode = chart.replaySystem?.getPlaybackMode
        ? chart.replaySystem.getPlaybackMode()
        : chart.replaySystem?.playbackMode;
      const snap = chart._indCalcSnapshot || null;
      const snapBars = snap && Number.isFinite(snap.barCount) ? snap.barCount : 0;
      const dataMap = chart.indicators?.data || {};
      const expected = priceBars > 0 ? computeExpectedTips(chart.data) : null;
      const prev = prevOverride !== undefined ? prevOverride : sink.prevSample;
      const priceAdvanced = !!(prev && priceBars > (prev.priceBars || 0));
      const closeMoved = !!(
        prev
        && Number.isFinite(priceClose)
        && Number.isFinite(prev.priceClose)
        && !valuesCloseEnough(priceClose, prev.priceClose)
      );
      const formingMoved = !!(
        prev
        && Number.isFinite(formingClose)
        && Number.isFinite(prev.formingClose)
        && !valuesCloseEnough(formingClose, prev.formingClose)
      );
      const perInd = [];
      let minSeriesLen = Infinity;
      let maxTipIndexDelta = 0;
      let maxBarDeltaLocal = 0;
      let valueMismatchCount = 0;
      let tipStagnantCount = 0;
      let intraBarTipFrozenCount = 0;
      let geomEndpointBehind = false;
      let anyCalculating = false;
      let maxAbsTipVsExpected = 0;
      let maxAbsTipVsClose = 0;

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
        const expectedReliable = sink.expectedReliable !== false;
        const matchesExpected = !expectedReliable
          ? true
          : (expectedTipVal == null
            ? tipVal == null
            : valuesCloseEnough(tipVal, expectedTipVal));
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
        // Intra-bar freeze: same tipIdx/tipVal while forming close moved and
        // tip does not match fresh expected for current OHLC. Tip index OK.
        const tipFrozenIntraBar = !!(
          !priceAdvanced
          && (closeMoved || formingMoved)
          && prevInd
          && tipIdx === prevInd.tipIdx
          && tipIdx >= 0
          && tipIndexDelta === 0
          && tipVal != null
          && prevInd.tipVal != null
          && valuesCloseEnough(tipVal, prevInd.tipVal)
          && expectedReliable
          && expectedTipVal != null
          && !matchesExpected
        );
        if (tipFrozenIntraBar) intraBarTipFrozenCount += 1;
        const valueStale = (tipIndexDelta === 0 && expectedReliable && expectedTipVal != null
          && tipVal != null && !matchesExpected)
          || (tipStagnant && (tipIndexDelta > 0 || (expectedReliable && !matchesExpected)));
        const mathLagVsClose = (tipVal != null && Number.isFinite(priceClose))
          ? Math.abs(tipVal - priceClose)
          : null;
        const tipVsExpected = (tipVal != null && expectedTipVal != null)
          ? Math.abs(tipVal - expectedTipVal)
          : null;
        if (tipVsExpected != null) maxAbsTipVsExpected = Math.max(maxAbsTipVsExpected, tipVsExpected);
        if (mathLagVsClose != null) maxAbsTipVsClose = Math.max(maxAbsTipVsClose, mathLagVsClose);
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
          tipFrozenIntraBar,
          valueFresh: !valueStale,
          mathLagVsClose,
          tipVsExpected,
          geomEndIdx,
          geomBehind,
          calculating: !!ind._calculating,
        });
      }
      if (!Number.isFinite(minSeriesLen)) minSeriesLen = 0;

      const indCommitBars = Math.min(minSeriesLen, snapBars || minSeriesLen);
      const barDelta = Math.max(0, priceBars - indCommitBars, maxBarDeltaLocal);
      // Temporal stale (I-g): length/index/value/geometry behind newest price paint.
      // Intra-bar freeze is tracked separately — tip index may still be GREEN.
      const temporalStale = barDelta > 0
        || maxTipIndexDelta > 0
        || valueMismatchCount > 0
        || geomEndpointBehind
        || (layerMeta && layerMeta.cacheHit === true && maxTipIndexDelta > 0);
      const closeDrift = (prev && Number.isFinite(priceClose) && Number.isFinite(prev.priceClose))
        ? Math.abs(priceClose - prev.priceClose)
        : 0;
      const formingDrift = (prev && Number.isFinite(formingClose) && Number.isFinite(prev.formingClose))
        ? Math.abs(formingClose - prev.formingClose)
        : 0;

      return {
        at: performance.now(),
        priceBars,
        priceTs,
        priceClose,
        formingClose,
        tickProgress,
        fastMode,
        playbackMode,
        playhead,
        snapBars,
        minSeriesLen,
        indCommitBars,
        barDelta,
        tipIndexDelta: maxTipIndexDelta,
        valueMismatchCount,
        tipStagnantCount,
        intraBarTipFrozenCount,
        geomEndpointBehind,
        temporalStale,
        stale: temporalStale,
        closeDrift,
        formingDrift,
        maxAbsTipVsExpected,
        maxAbsTipVsClose,
        workerBusy: !!chart._indicatorWorkerBusy,
        pendingRecalcRaf: chart._replayIndRecalcRaf != null,
        dataVersion: chart.dataVersion ?? null,
        indRenderVersion: chart._indicatorRenderVersion ?? null,
        sessionIndReplayFp: chart._sessionIndReplayFp || null,
        layerCacheHit: layerMeta ? !!layerMeta.cacheHit : null,
        layerKey: layerMeta ? layerMeta.key || null : null,
        anyCalculating,
        perInd,
      };
    };

    const sink = window.__m19ig2Sink;
    if (!sink) return { ok: false, reason: 'm19ig2 sink missing (preDocument failed)' };

    // Count same-bar skip vs real recalc during play (instrument only).
    if (typeof chart.scheduleReplayIndicatorRecalc === 'function'
      && !chart.scheduleReplayIndicatorRecalc.__m19ig2Wrapped) {
      const origSched = chart.scheduleReplayIndicatorRecalc.bind(chart);
      chart.scheduleReplayIndicatorRecalc = function m19ig2Sched(isPlaying) {
        sink.recalcStats.scheduled += 1;
        const playing = isPlaying != null
          ? !!isPlaying
          : !!(replay && replay.isActive && replay.isPlaying);
        if (playing) {
          sink.recalcStats.played += 1;
          const data = chart.data;
          const last = data && data.length ? data[data.length - 1] : null;
          const fp = data && data.length
            ? [
              data.length,
              last && last.t,
              (chart.indicators.active || []).map((ind) => (
                `${String(ind.id || '')}:${String(ind.type || '').toLowerCase()}`
              )).join(','),
            ].join('|')
            : null;
          const ready = (chart.indicators?.active || []).every((ind) => (
            ind && ind.id && chart.indicators?.data?.[ind.id]
          ));
          if (fp && fp === chart._sessionIndReplayFp && ready) {
            sink.recalcStats.skippedSameBar += 1;
          } else {
            sink.recalcStats.fullOrTail += 1;
          }
        }
        return origSched(isPlaying);
      };
      chart.scheduleReplayIndicatorRecalc.__m19ig2Wrapped = true;
    }

    if (!chart.render.__m19ig2Wrapped) {
      const origRender = chart.render.bind(chart);
      chart.render = function m19ig2Render(...args) {
        const ret = origRender(...args);
        try {
          if (sink.sampling) {
            const sample = samplePresentation(sink.lastLayerMeta, sink.prevSample);
            sink.paints.push(sample);
            sink.paintCount += 1;
            sink.prevSample = sample;
          }
        } catch (_e) { /* ignore */ }
        return ret;
      };
      chart.render.__m19ig2Wrapped = true;
    }

    // Dense tick sampling — headless often coalesces chart.render() and misses
    // mid-bar freeze that humans see between sparse paints.
    const sampleTick = () => {
      if (!sink.sampling) return;
      const sample = samplePresentation(sink.lastLayerMeta, sink.prevTickSample);
      sample.kind = 'tick';
      sink.ticks.push(sample);
      sink.tickCount += 1;
      sink.prevTickSample = sample;
    };
    if (typeof replay.updateChartWithAnimatedCandle === 'function'
      && !replay.updateChartWithAnimatedCandle.__m19ig2Wrapped) {
      const origAnim = replay.updateChartWithAnimatedCandle.bind(replay);
      replay.updateChartWithAnimatedCandle = function m19ig2Anim(...args) {
        const ret = origAnim(...args);
        try { sampleTick(); } catch (_e) { /* ignore */ }
        return ret;
      };
      replay.updateChartWithAnimatedCandle.__m19ig2Wrapped = true;
    }
    if (typeof replay.updateChartDataFast === 'function'
      && !replay.updateChartDataFast.__m19ig2Wrapped) {
      const origFast = replay.updateChartDataFast.bind(replay);
      replay.updateChartDataFast = function m19ig2Fast(...args) {
        const ret = origFast(...args);
        try { sampleTick(); } catch (_e) { /* ignore */ }
        return ret;
      };
      replay.updateChartDataFast.__m19ig2Wrapped = true;
    }

    if (typeof chart.drawIndicatorsOptimized === 'function'
      && !chart.drawIndicatorsOptimized.__m19ig2Wrapped) {
      const origOpt = chart.drawIndicatorsOptimized.bind(chart);
      chart.drawIndicatorsOptimized = function m19ig2DrawOpt(...args) {
        const keyBefore = chart._indLayerCacheKey;
        const drawn = {};
        const origDraw = typeof chart.drawIndicators === 'function'
          ? chart.drawIndicators.bind(chart)
          : null;
        if (origDraw && !chart.drawIndicators.__m19ig2InnerWrapped) {
          chart.drawIndicators = function m19ig2DrawInd(...dArgs) {
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
            return origDraw(...dArgs);
          };
          chart.drawIndicators.__m19ig2InnerWrapped = true;
        }
        const ret = origOpt(...args);
        const keyAfter = chart._indLayerCacheKey;
        const cacheHit = keyBefore != null && keyBefore === keyAfter;
        sink.lastLayerMeta = {
          cacheHit,
          key: keyAfter || keyBefore || null,
          lastDrawnTipIdxById: drawn,
        };
        return ret;
      };
      chart.drawIndicatorsOptimized.__m19ig2Wrapped = true;
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
    const expectedReliable = Array.isArray(warm.perInd)
      && warm.perInd.length === exactTypes.length
      && warm.perInd.every((p) => p.matchesExpected !== false
        && (p.tipIndexDelta || 0) === 0
        && (p.barDelta || 0) === 0);
    sink.expectedReliable = expectedReliable;
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
      playbackMode: replay.getPlaybackMode ? replay.getPlaybackMode() : replay.playbackMode,
      warmSample: warm,
    };
  }, {
    startOffset: START_INDEX_OFFSET,
    exactMix: EXACT_MIX,
    exactTypes: EXACT_TYPES,
    valueEpsAbs: 1e-6,
    valueEpsRel: 1e-8,
  });
}

async function runPlayFeel(page, { speed, playMs, label }) {
  return page.evaluate(async ({ speed, playMs, label }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m19ig2Sink;
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

    // Keep tick mode for every ladder cell (PO path).
    replay.playbackMode = 'tick';
    replay.tickAnimationEnabled = true;

    try {
      if (typeof chart.recalculateIndicators === 'function') chart.recalculateIndicators();
    } catch (_e) { /* ignore */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const quietStart = performance.now();
    while (chart._indicatorWorkerBusy && performance.now() - quietStart < 5_000) {
      await new Promise((r) => setTimeout(r, 20));
    }

    sink.paints = [];
    sink.ticks = [];
    sink.commits = [];
    sink.paintCount = 0;
    sink.tickCount = 0;
    sink.commitCount = 0;
    sink.lastLayerMeta = null;
    sink.prevSample = null;
    sink.prevTickSample = null;
    sink.recalcStats = {
      scheduled: 0,
      played: 0,
      skippedSameBar: 0,
      fullOrTail: 0,
    };
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
    // play() defers start via double rAF — wait until the loop is actually armed.
    const armDeadline = performance.now() + 1_500;
    while (!replay.isPlaying && performance.now() < armDeadline) {
      await new Promise((r) => setTimeout(r, 16));
    }
    const playingDuring = !!replay.isPlaying;
    const modeDuring = replay.getPlaybackMode ? replay.getPlaybackMode() : replay.playbackMode;
    const effectiveSpeed = typeof replay.getEffectivePlaybackSpeed === 'function'
      ? replay.getEffectivePlaybackSpeed()
      : speed;
    const fastDuringEarly = !!replay.fastMode;
    const armedAt = performance.now();
    await new Promise((r) => setTimeout(r, Math.max(0, playMs)));
    try { replay.pause(); } catch (_) {}
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    sink.sampling = false;
    const t1 = performance.now();

    const idx1 = replay.currentIndex;
    const price1 = Array.isArray(chart.data) ? chart.data.length : 0;
    const paints = sink.paints.slice();
    // Prefer dense tick samples for feel; fall back to paints if tick hooks missed.
    const samples = (sink.ticks && sink.ticks.length >= 8) ? sink.ticks.slice() : paints.slice();
    const elapsedSec = Math.max(1e-6, (t1 - armedAt) / 1000);

    const firstStaleAt = new Map();
    const catchUpLags = [];
    let consecutive = 0;
    let maxConsecutive = 0;
    let staleFrames = 0;
    let maxBarDelta = 0;
    let maxTipIndexDelta = 0;
    let valueMismatchFrames = 0;
    let geomBehindFrames = 0;
    let mathLagOnlyFrames = 0;
    let intraBarFrozenFrames = 0;
    let closeDriftWhileFrozen = 0;
    let formingDriftWhileFrozen = 0;
    let tipJumpAtBarAdvance = 0;
    let tipJumpCount = 0;
    let tickModePaints = 0;
    let fastModePaints = 0;
    const barDeltas = [];
    const tipIndexDeltas = [];
    const staleByType = { sma: 0, ema: 0, wma: 0, dema: 0, tema: 0 };
    let maxWorkerBusyDuringStale = false;
    let prevTipFingerprint = null;

    for (const p of samples) {
      maxBarDelta = Math.max(maxBarDelta, p.barDelta || 0);
      maxTipIndexDelta = Math.max(maxTipIndexDelta, p.tipIndexDelta || 0);
      barDeltas.push(p.barDelta || 0);
      tipIndexDeltas.push(p.tipIndexDelta || 0);
      if ((p.valueMismatchCount || 0) > 0) valueMismatchFrames += 1;
      if (p.geomEndpointBehind) geomBehindFrames += 1;
      if ((p.intraBarTipFrozenCount || 0) > 0) {
        intraBarFrozenFrames += 1;
        closeDriftWhileFrozen += Number(p.closeDrift) || 0;
        formingDriftWhileFrozen += Number(p.formingDrift) || 0;
      }
      if (p.playbackMode === 'tick') tickModePaints += 1;
      if (p.fastMode) fastModePaints += 1;

      if (!p.temporalStale && Array.isArray(p.perInd) && p.perInd.length) {
        const allMathLag = p.perInd.every((ind) => (
          ind.valueFresh
          && ind.mathLagVsClose != null
          && ind.mathLagVsClose > 0
        ));
        if (allMathLag) mathLagOnlyFrames += 1;
      }

      if (Array.isArray(p.perInd)) {
        const tipFp = p.perInd.map((ind) => `${ind.id}:${ind.tipIdx}:${ind.tipVal}`).join('|');
        if (prevTipFingerprint && tipFp !== prevTipFingerprint && (p.priceBars || 0) > 0) {
          let jump = 0;
          let n = 0;
          for (const ind of p.perInd) {
            if (ind.tipVsExpected != null) {
              jump += ind.tipVsExpected;
              n += 1;
            }
          }
          if (n > 0) {
            tipJumpAtBarAdvance = Math.max(tipJumpAtBarAdvance, jump / n);
            tipJumpCount += 1;
          }
        }
        prevTipFingerprint = tipFp;
        for (const ind of p.perInd) {
          if (!ind.valueFresh || (ind.tipIndexDelta || 0) > 0 || (ind.barDelta || 0) > 0
            || ind.tipFrozenIntraBar) {
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

    const paintCount = paints.length;
    const tickCount = sink.ticks.length;
    const sampleCount = samples.length;
    const sampleSource = (sink.ticks && sink.ticks.length >= 8) ? 'ticks' : 'paints';
    const intraBarStaleRatio = sampleCount > 0 ? intraBarFrozenFrames / sampleCount : 0;
    const closeDriftWhileFrozenPerSec = closeDriftWhileFrozen / elapsedSec;
    const formingDriftWhileFrozenPerSec = formingDriftWhileFrozen / elapsedSec;
    const skipRatio = sink.recalcStats.played > 0
      ? sink.recalcStats.skippedSameBar / sink.recalcStats.played
      : 0;

    return {
      ok: true,
      label,
      speed,
      effectiveSpeed,
      playMs,
      playingDuring,
      modeDuring,
      fastDuringEarly,
      indexDelta: idx1 - idx0,
      priceBarsDelta: price1 - price0,
      elapsedMs: t1 - t0,
      armedElapsedMs: t1 - armedAt,
      paintCount,
      tickCount,
      sampleCount,
      sampleSource,
      commitCount: sink.commitCount,
      staleFrames,
      maxConsecutiveStaleFrames: maxConsecutive,
      maxBarDelta,
      maxTipIndexDelta,
      valueMismatchFrames,
      geomBehindFrames,
      mathLagOnlyFrames,
      intraBarFrozenFrames,
      intraBarStaleRatio,
      closeDriftWhileFrozen,
      closeDriftWhileFrozenPerSec,
      formingDriftWhileFrozen,
      formingDriftWhileFrozenPerSec,
      tipJumpAtBarAdvanceMax: tipJumpAtBarAdvance,
      tipJumpCount,
      tickModePaints,
      fastModePaints,
      staleByType,
      barDeltaP95: pct(barDeltas, 95),
      tipIndexDeltaP95: pct(tipIndexDeltas, 95),
      catchUpLagMs: {
        n: catchUpLags.length,
        max: catchUpLags.length ? Math.max(...catchUpLags) : 0,
        p95: pct(catchUpLags, 95) ?? 0,
        median: pct(catchUpLags, 50) ?? 0,
        samples: catchUpLags.slice(0, 40),
      },
      workerBusySeenOnStalePaint: maxWorkerBusyDuringStale,
      recalcStats: { ...sink.recalcStats, skipRatio },
      m19ifStats: chart._m19ifStats ? { ...chart._m19ifStats } : null,
      sampleHead: samples.slice(0, 2),
      sampleTail: samples.slice(-2),
      firstTemporalStale: samples.find((p) => p.temporalStale) || null,
      firstIntraBarFrozen: samples.find((p) => (p.intraBarTipFrozenCount || 0) > 0) || null,
    };
  }, { speed, playMs, label });
}

function evaluateTemporal(cell, { minAdvances = MIN_PRICE_ADVANCES } = {}) {
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
      pass: (cell.sampleCount || 0) >= MIN_PAINT_SAMPLES
        || (cell.tickCount || 0) >= MIN_TICK_SAMPLES
        || (cell.paintCount || 0) >= MIN_PAINT_SAMPLES,
      paintCount: cell.paintCount,
      tickCount: cell.tickCount,
      sampleCount: cell.sampleCount,
      sampleSource: cell.sampleSource,
      minTicks: MIN_TICK_SAMPLES,
      minPaints: MIN_PAINT_SAMPLES,
    },
    consecutiveStaleFrames: {
      pass: (cell.maxConsecutiveStaleFrames || 0) <= MAX_CONSECUTIVE_STALE_FRAMES,
      value: cell.maxConsecutiveStaleFrames,
      limit: MAX_CONSECUTIVE_STALE_FRAMES,
    },
    catchUpLagP95: {
      pass: Number(lag.p95) <= CATCH_UP_LAG_P95_MS_MAX,
      value: lag.p95,
      limitMs: CATCH_UP_LAG_P95_MS_MAX,
    },
    catchUpLagMax: {
      pass: Number(lag.max) <= CATCH_UP_LAG_MAX_MS_MAX,
      value: lag.max,
      limitMs: CATCH_UP_LAG_MAX_MS_MAX,
    },
    barDelta: {
      pass: (cell.maxBarDelta || 0) <= MAX_BAR_DELTA,
      value: cell.maxBarDelta,
      limit: MAX_BAR_DELTA,
    },
    tipIndexDelta: {
      pass: (cell.maxTipIndexDelta || 0) <= MAX_TIP_INDEX_DELTA,
      value: cell.maxTipIndexDelta,
      limit: MAX_TIP_INDEX_DELTA,
    },
    // Note: valueMismatchFrames in tick mode includes intra-bar freeze vs forming
    // expected tip. That is intentional for I-g2 (I-g candle mode hid it).
    valueMismatchFrames: {
      pass: (cell.valueMismatchFrames || 0) <= MAX_VALUE_MISMATCH_FRAMES,
      value: cell.valueMismatchFrames,
      limit: MAX_VALUE_MISMATCH_FRAMES,
      justification: 'Committed tip must track fresh expected tip for current forming OHLC.',
    },
  };
  return { asserts, green: Object.values(asserts).every((a) => a.pass === true) };
}

function evaluateFeel(cell, ctrlCell, { isPrimary = false, isStress = false } = {}) {
  const ratio = cell.intraBarStaleRatio || 0;
  const driftPerSec = cell.closeDriftWhileFrozenPerSec || 0;
  const ctrlDrift = ctrlCell ? (ctrlCell.closeDriftWhileFrozenPerSec || 0) : 0;
  const intensityRatio = ctrlDrift > 1e-12 ? driftPerSec / ctrlDrift : (driftPerSec > 0 ? Infinity : 0);
  const skipRatio = cell.recalcStats?.skipRatio || 0;
  const sampleN = cell.sampleCount || cell.paintCount || 0;
  const fastRatio = sampleN > 0 ? (cell.fastModePaints || 0) / sampleN : 0;
  const inFastMode = fastRatio > 0.5 || cell.fastDuringEarly === true;
  const asserts = {
    // Smooth-tick freeze gates apply when NOT dominated by fast mode.
    intraBarStaleRatio: {
      pass: inFastMode || ratio <= MAX_INTRA_BAR_STALE_RATIO,
      value: ratio,
      limit: MAX_INTRA_BAR_STALE_RATIO,
      frozenFrames: cell.intraBarFrozenFrames,
      sampleCount: sampleN,
      skippedBecauseFastMode: inFastMode,
      justification: 'Fraction of samples with tip frozen while forming close moved (fingerprint skip).',
    },
    closeDriftWhileFrozenPerSec: {
      pass: inFastMode || driftPerSec <= MAX_CLOSE_DRIFT_WHILE_FROZEN_PER_SEC,
      value: driftPerSec,
      limit: MAX_CLOSE_DRIFT_WHILE_FROZEN_PER_SEC,
      skippedBecauseFastMode: inFastMode,
      justification: 'Price close drift/sec while tip frozen — smooth-tick feel intensity.',
    },
    feelIntensityVsControl: {
      pass: inFastMode || !(ctrlCell) || intensityRatio <= MAX_FEEL_INTENSITY_RATIO_VS_CTRL
        || driftPerSec <= MAX_CLOSE_DRIFT_WHILE_FROZEN_PER_SEC * 0.25,
      value: intensityRatio,
      limit: MAX_FEEL_INTENSITY_RATIO_VS_CTRL,
      primaryDriftPerSec: driftPerSec,
      controlDriftPerSec: ctrlDrift,
      skippedBecauseFastMode: inFastMode,
      justification: 'Smooth-tick freeze intensity must not exceed ~3× the 15x control.',
    },
    // Selected 60x/100x must remain smooth tick like 15x, not commit-only fast mode.
    silentFastModeAtPrimaryUi: {
      pass: !(isPrimary || isStress) || fastRatio <= MAX_FAST_MODE_SAMPLE_RATIO_AT_PRIMARY,
      value: fastRatio,
      limit: MAX_FAST_MODE_SAMPLE_RATIO_AT_PRIMARY,
      fastModePaints: cell.fastModePaints,
      sampleCount: sampleN,
      uiSpeed: cell.speed,
      effectiveSpeed: cell.effectiveSpeed,
      note: 'Tick mode must keep labelled 60x/100x forming-candle paints.',
    },
    sameBarSkipObserved: {
      pass: true,
      skipRatio,
      recalcStats: cell.recalcStats,
      inFastMode,
      note: 'same-bar fingerprint skips (smooth) or fast-mode bar completes — diagnostic.',
    },
  };
  return {
    asserts,
    green: Object.values(asserts).every((a) => a.pass === true),
    intensityRatio,
    fastRatio,
    inFastMode,
  };
}

const KILL_SWITCHES = String(process.env.M19_IG2_KILL_SWITCHES || process.env.M19_IG_KILL_SWITCHES || '')
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
      'M19-I-g2 SETUP-FAIL: M19_DEPLOYED_ORIGIN set but harness server is not in deployed mode.',
    );
  }
  const browser = await launchBrowser({ headful: false });
  let boot;
  let green = false;
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

    const setup = await setupExactFiveMaTickMix(page);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');

    await sleep(50);

    // Control first — PO "15x perfect" baseline for feel intensity ratio.
    const ctrl = await runPlayFeel(page, {
      speed: CTRL_SPEED,
      playMs: PLAY_MS_CTRL,
      label: `${CTRL_SPEED}x-control`,
    });
    if (!ctrl?.ok) throw new Error(ctrl?.reason || 'control play failed');

    const primaryRuns = [];
    for (let i = 0; i < PRIMARY_REPEATS; i++) {
      const cell = await runPlayFeel(page, {
        speed: PRIMARY_SPEED,
        playMs: PLAY_MS_60X,
        label: `${PRIMARY_SPEED}x-primary-run${i + 1}`,
      });
      if (!cell?.ok) throw new Error(cell?.reason || `${PRIMARY_SPEED}x run ${i + 1} failed`);
      primaryRuns.push(cell);
    }

    const stress = await runPlayFeel(page, {
      speed: STRESS_SPEED,
      playMs: PLAY_MS_100X,
      label: `${STRESS_SPEED}x-stress`,
    });
    if (!stress?.ok) throw new Error(stress?.reason || '100x stress failed');

    const primaryTemporal = primaryRuns.map((c) => evaluateTemporal(c, { minAdvances: MIN_PRICE_ADVANCES }));
    const primaryFeel = primaryRuns.map((c) => evaluateFeel(c, ctrl, { isPrimary: true }));
    const stressTemporal = evaluateTemporal(stress, { minAdvances: MIN_PRICE_ADVANCES });
    const stressFeel = evaluateFeel(stress, ctrl, { isStress: true });
    const ctrlTemporal = evaluateTemporal(ctrl, {
      minAdvances: Math.max(1, Math.floor(MIN_PRICE_ADVANCES / 3)),
    });
    // Soften control advance: forming ticks may keep indexDelta=0 while priceBars grow.
    if (ctrlTemporal.asserts.playAdvanced && !ctrlTemporal.asserts.playAdvanced.pass) {
      const soft = (ctrl.tickCount || 0) >= 15 || (ctrl.priceBarsDelta || 0) >= 1;
      ctrlTemporal.asserts.playAdvanced = {
        ...ctrlTemporal.asserts.playAdvanced,
        pass: soft,
        softAdvance: soft,
        note: '15x smooth tick may complete <1 raw bar in play window; tick samples suffice.',
      };
      ctrlTemporal.green = Object.values(ctrlTemporal.asserts).every((a) => a.pass === true);
    }
    const ctrlFeelDiag = evaluateFeel(ctrl, null);

    const worstPrimary = primaryRuns.reduce((acc, cell, idx) => {
      const score = (cell.staleFrames || 0) * 1000
        + (cell.intraBarFrozenFrames || 0) * 10
        + (cell.closeDriftWhileFrozenPerSec || 0) * 1e6
        + (cell.maxTipIndexDelta || 0) * 10
        + (cell.valueMismatchFrames || 0);
      if (!acc || score > acc.score) {
        return {
          cell,
          temporal: primaryTemporal[idx],
          feel: primaryFeel[idx],
          score,
          run: idx + 1,
        };
      }
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
      },
      tickModeArmed: {
        pass: setup.playbackMode === 'tick' && ctrl.modeDuring === 'tick',
        setupMode: setup.playbackMode,
        controlModeDuring: ctrl.modeDuring,
        note: 'I-g2 requires tick mode (I-g candle mode is blind to mid-bar freeze).',
      },
      primaryRepeats: {
        pass: primaryRuns.length >= 3
          && primaryTemporal.every((e) => e.green)
          && primaryFeel.every((e) => e.green),
        runs: primaryRuns.length,
        temporalPass: primaryTemporal.map((e) => e.green),
        feelPass: primaryFeel.map((e) => e.green),
      },
      primaryPlayAdvanced: worstPrimary.temporal.asserts.playAdvanced,
      primaryPaintSamples: worstPrimary.temporal.asserts.paintSamples,
      primaryConsecutiveStale: worstPrimary.temporal.asserts.consecutiveStaleFrames,
      primaryCatchUpLagP95: worstPrimary.temporal.asserts.catchUpLagP95,
      primaryCatchUpLagMax: worstPrimary.temporal.asserts.catchUpLagMax,
      primaryBarDelta: worstPrimary.temporal.asserts.barDelta,
      primaryTipIndexDelta: worstPrimary.temporal.asserts.tipIndexDelta,
      primaryValueMismatchFrames: worstPrimary.temporal.asserts.valueMismatchFrames,
      primaryIntraBarStaleRatio: worstPrimary.feel.asserts.intraBarStaleRatio,
      primaryCloseDriftWhileFrozenPerSec: worstPrimary.feel.asserts.closeDriftWhileFrozenPerSec,
      primaryFeelIntensityVsControl: worstPrimary.feel.asserts.feelIntensityVsControl,
      primarySilentFastMode: worstPrimary.feel.asserts.silentFastModeAtPrimaryUi,
      stressPlayAdvanced: stressTemporal.asserts.playAdvanced,
      stressPaintSamples: stressTemporal.asserts.paintSamples,
      stressConsecutiveStale: stressTemporal.asserts.consecutiveStaleFrames,
      stressCatchUpLagP95: stressTemporal.asserts.catchUpLagP95,
      stressCatchUpLagMax: stressTemporal.asserts.catchUpLagMax,
      stressBarDelta: stressTemporal.asserts.barDelta,
      stressTipIndexDelta: stressTemporal.asserts.tipIndexDelta,
      stressValueMismatchFrames: stressTemporal.asserts.valueMismatchFrames,
      stressIntraBarStaleRatio: stressFeel.asserts.intraBarStaleRatio,
      stressCloseDriftWhileFrozenPerSec: stressFeel.asserts.closeDriftWhileFrozenPerSec,
      stressFeelIntensityVsControl: stressFeel.asserts.feelIntensityVsControl,
      stressSilentFastMode: stressFeel.asserts.silentFastModeAtPrimaryUi,
      controlPlayAdvanced: ctrlTemporal.asserts.playAdvanced,
      controlPaintSamples: ctrlTemporal.asserts.paintSamples,
      controlTickMode: {
        pass: (ctrl.modeDuring === 'tick')
          && ((ctrl.tickCount || 0) >= 20 || (ctrl.tickModePaints || 0) >= 8),
        tickModePaints: ctrl.tickModePaints,
        tickCount: ctrl.tickCount,
        paintCount: ctrl.paintCount,
        fastModePaints: ctrl.fastModePaints,
        modeDuring: ctrl.modeDuring,
      },
    };

    if (KILL_SWITCHES.length === 0) {
      asserts.exactMixBridgeDiagnostics = {
        pass: true,
        m19ifStats: worstPrimary.cell.m19ifStats || {},
        recalcStats: worstPrimary.cell.recalcStats || {},
        controlRecalcStats: ctrl.recalcStats || {},
      };
    }

    green = Object.values(asserts).every((a) => a.pass === true);

    const tipIndexGreen = (worstPrimary.cell.maxTipIndexDelta || 0) <= MAX_TIP_INDEX_DELTA
      && (stress.maxTipIndexDelta || 0) <= MAX_TIP_INDEX_DELTA;
    const silentFast = worstPrimary.feel.inFastMode === true
      || stressFeel.inFastMode === true
      || (worstPrimary.feel.asserts.silentFastModeAtPrimaryUi
        && worstPrimary.feel.asserts.silentFastModeAtPrimaryUi.pass === false);
    const feelRed = !worstPrimary.feel.green || !stressFeel.green;
    const temporalRed = !worstPrimary.temporal.green || !stressTemporal.green;
    const mathOnlySuspect = green
      && tipIndexGreen
      && !silentFast
      && (worstPrimary.cell.intraBarFrozenFrames || 0) === 0
      && (stress.intraBarFrozenFrames || 0) === 0
      && (worstPrimary.cell.mathLagOnlyFrames || 0) > 0;

    let mechanismNote;
    if (silentFast && tipIndexGreen) {
      mechanismNote = 'I-g tip-index GREEN is correct but blind to PO feel: tick-mode '
        + 'getEffectivePlaybackSpeed()=min(200, uiSpeed*2) makes UI 60x → effective 120x FAST MODE '
        + '(no forming ticks), while UI 15x → effective 30x stays SMOOTH. At 15x, same-bar '
        + `fingerprint skips are real (control skipRatio=${ctrl.recalcStats?.skipRatio}, `
        + `intraBarStaleRatio=${ctrl.intraBarStaleRatio}) but PO-acceptable. At UI 60x the silent `
        + 'fast-mode shift removes tick animation; MA trails look like delay vs 15x. '
        + 'Lane 1: replay-system.js getEffectivePlaybackSpeed tick ×2 and/or fast-mode threshold; '
        + 'optional: include forming OHLC in _replayIndicatorBarFingerprint for smooth-tick tip updates.';
    } else if (mathOnlySuspect) {
      mechanismNote = 'No tip-index temporal lag, no silent fast-mode at 60x, no intra-bar tip freeze; '
        + 'PO feel is mathematical MA smoothing only (tips fresh for forming OHLC).';
    } else if (!green && tipIndexGreen && feelRed) {
      mechanismNote = 'Tip-index GREEN (I-g blind spot) but tick-mode intra-bar tip freeze vs '
        + 'forming close exceeds 15x control. Product: _replayIndicatorBarFingerprint omits OHLC.';
    } else if (!green && temporalRed) {
      mechanismNote = 'Temporal tip-index/value lag evidenced at high speed in tick mode.';
    } else if (green) {
      mechanismNote = 'Tick-mode speed ladder coherent vs 15x control (no silent fast-mode, tip gates OK).';
    } else {
      mechanismNote = 'Acceptance gates failed; see asserts.';
    }

    const result = {
      ticket: 'M19-I-g2',
      scenario: 'exact SMA20+EMA20+WMA20+DEMA20+TEMA20 / tick mode / 15x vs 60x/100x PO-feel',
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
        ? `Product /chart/* from deployed origin ${DEPLOYED_ORIGIN}; synthetic /api/* + /harness/* local. `
          + 'Tick-mode presentation sampled at chart.render(); I-g candle tip-index gate not weakened.'
        : 'Local checkout assets; tick-mode feel sampling at chart.render().',
      setup,
      thresholds: {
        frameMs60Hz: FRAME_MS_60HZ,
        catchUpLagP95MsMax: CATCH_UP_LAG_P95_MS_MAX,
        maxConsecutiveStaleFrames: MAX_CONSECUTIVE_STALE_FRAMES,
        maxBarDelta: MAX_BAR_DELTA,
        maxTipIndexDelta: MAX_TIP_INDEX_DELTA,
        maxValueMismatchFrames: MAX_VALUE_MISMATCH_FRAMES,
        maxIntraBarStaleRatio: MAX_INTRA_BAR_STALE_RATIO,
        maxCloseDriftWhileFrozenPerSec: MAX_CLOSE_DRIFT_WHILE_FROZEN_PER_SEC,
        maxFeelIntensityRatioVsCtrl: MAX_FEEL_INTENSITY_RATIO_VS_CTRL,
        productContract: {
          primaryPath: 'replay-system.js keeps tick speed equal to the UI label and preserves '
            + 'frame-budgeted forming-candle paints through 100x.',
          secondaryPath: 'chart-indicators-full.js includes forming OHLC in the I-g fingerprint '
            + 'and refreshes the current MA tip during smooth tick.',
          killSwitch: '__TALARIA_DISABLE_M19I_TICK_SPEED_COHERENCE_V1',
        },
      },
      primarySpeed: PRIMARY_SPEED,
      stressSpeed: STRESS_SPEED,
      controlSpeed: CTRL_SPEED,
      controlSpeedCell: ctrl,
      primaryRuns,
      highSpeed: worstPrimary.cell,
      stressSpeedCell: stress,
      feelEvidence: {
        primaryWorstRun: worstPrimary.run,
        primaryIntraBarFrozenFrames: worstPrimary.cell.intraBarFrozenFrames,
        primaryIntraBarStaleRatio: worstPrimary.cell.intraBarStaleRatio,
        primaryCloseDriftWhileFrozenPerSec: worstPrimary.cell.closeDriftWhileFrozenPerSec,
        primaryFeelIntensityVsControl: worstPrimary.feel.intensityRatio,
        primaryFastModeRatio: worstPrimary.feel.fastRatio,
        primaryInFastMode: worstPrimary.feel.inFastMode,
        primarySkipRatio: worstPrimary.cell.recalcStats?.skipRatio ?? null,
        primaryMaxTipIndexDelta: worstPrimary.cell.maxTipIndexDelta,
        primaryValueMismatchFrames: worstPrimary.cell.valueMismatchFrames,
        primaryMathLagOnlyFrames: worstPrimary.cell.mathLagOnlyFrames,
        effectiveSpeedNote: `label/effective: ${CTRL_SPEED}/${ctrl.effectiveSpeed}, `
          + `${PRIMARY_SPEED}/${worstPrimary.cell.effectiveSpeed}, `
          + `${STRESS_SPEED}/${stress.effectiveSpeed}`,
        stressIntraBarStaleRatio: stress.intraBarStaleRatio,
        stressCloseDriftWhileFrozenPerSec: stress.closeDriftWhileFrozenPerSec,
        stressFeelIntensityVsControl: stressFeel.intensityRatio,
        stressFastModeRatio: stressFeel.fastRatio,
        stressSkipRatio: stress.recalcStats?.skipRatio ?? null,
        controlIntraBarStaleRatio: ctrl.intraBarStaleRatio,
        controlCloseDriftWhileFrozenPerSec: ctrl.closeDriftWhileFrozenPerSec,
        controlSkipRatio: ctrl.recalcStats?.skipRatio ?? null,
        controlFastModePaints: ctrl.fastModePaints,
        controlFeelDiag: ctrlFeelDiag.asserts,
      },
      mechanismNote,
      asserts,
      verdict: green ? 'M19-I-g2-GREEN' : 'M19-I-g2-RED',
      pass: green,
      note: green
        ? 'Tick-mode five-MA feel ladder GREEN vs 15x; tip freeze not above thresholds.'
        : 'RED: measurable PO-feel mechanism (intra-bar tip freeze and/or temporal tip lag) at high tick speed.',
      doesNotSupersede: 'M19-I-g candle tip-index gate and M19-I-f PO-mix remain standing.',
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
