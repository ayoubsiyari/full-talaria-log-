/**
 * M21 / G2 — painted endpoint VALUE/Y oracle RED probe (4-panel HOST).
 *
 * STATUS: PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY
 * Phase: PREPARATION / RED evidence only. NO product edits. NO GREEN claim.
 *
 * Unit under test (after bar-index/pixel-occupancy oracle stayed non-RED):
 *   actual final drawn indicator endpoint Y/value vs independently computed
 *   expected tip from current forming OHLC, projected through active yScale.
 *
 * Oracle (not data-array alone, not mere pixel occupancy):
 *   Canvas2D moveTo/lineTo/stroke tips during drawIndicators*; invert Y → value.
 *   Expected tip recomputed from bars with last close = formingClose (SMA/EMA/
 *   WMA/DEMA/TEMA period 20). Pair tip-column strokes ↔ expected by sorted Y.
 *
 * Gates:
 *   ≥60 evaluated HOST frames @ 60× and 100×
 *   |drawnY − expectedY| ≤ MAX_Y_PX (default 2.5) and value within eps
 *   consecutive value-stale frames under workerBusy ≤ 1
 *   G2: HOST stale while panel peers stay clean
 *
 * Run (synthetic harness, no login):
 *   M19_EXPECTED_BUILD_ID=20260724b61 M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     M21_VY_OUT=docs/plan3/evidence/W5-M21-PAINTED-ENDPOINT-VALUE-Y-b61-RED.PRELIMINARY.json \
 *     node m21-painted-endpoint-value-y-red-probe.mjs
 *
 * Auth-bound product runner (no admin):
 *   node m21-painted-endpoint-value-y-auth-bound-runner.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, normalizeDeployedOrigin } from './serve.mjs';
import {
  bootLayout, launchBrowser, sleep, panelFrameMap, embedFrames,
} from './harness-lib.mjs';
import {
  resolvePredocFlagsFromEnv,
  buildPredocFlagsHook,
  composePredocWithProbe,
  predocEvidenceStub,
} from './m21-vy-predoc-flags.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHART_JS_PATH = path.resolve(__dirname, '../../chart.js');
const SERVE_MJS_PATH = path.resolve(__dirname, 'serve.mjs');

const STATUS_MARK = 'PRELIMINARY-PENDING-GPT56/AUTH';
const CANDIDATE_BUILD = '20260724b61';
/** Prior prep-matrix 15× clean baseline (Cycle D) — comparison only. */
const PRIOR_15X_CLEAN_BASELINE = {
  source: 'W5-M21-VY-PREP-MATRIX-b61.PRELIMINARY.json#control15x',
  playMs: 24_000,
  evaluatedCount: 76,
  maxTemaAbsYPx: 0.5022703442536596,
  staleRatio: 0,
  paintedRed: false,
};

const MAX_Y_PX = Math.max(0.5, Number(process.env.M21_VY_MAX_Y_PX) || 2.5);
const MAX_VALUE_ABS = Math.max(1e-9, Number(process.env.M21_VY_MAX_VALUE_ABS) || 1e-5);
const MAX_VALUE_REL = Math.max(1e-12, Number(process.env.M21_VY_MAX_VALUE_REL) || 1e-6);
const MAX_STALE_RATIO = 0.08;
const MAX_CONSEC_STALE_BUSY = 1;
const MIN_EVALUATED = Math.max(60, Number(process.env.M21_VY_MIN_EVALUATED) || 60);
const MIN_ORACLE_COVERAGE = 0.5;
const PLAY_MS_60X = Math.max(4_000, Number(process.env.M21_VY_PLAY_MS_60X) || 20_000);
const PLAY_MS_100X = Math.max(4_000, Number(process.env.M21_VY_PLAY_MS_100X) || 20_000);
const PRIMARY_SPEED = Math.max(1, Number(process.env.M21_VY_PRIMARY_SPEED) || 60);
const STRESS_SPEED = Math.max(1, Number(process.env.M21_VY_STRESS_SPEED) || 100);
const START_INDEX_OFFSET = Math.max(2_000, Number(process.env.M21_VY_START_OFFSET) || 4_000);
const PANEL_IDS = ['B', 'C', 'D'];

const FIVE_MA_MIX = [
  ['sma', { period: 20 }],
  ['ema', { period: 20 }],
  ['wma', { period: 20 }],
  ['dema', { period: 20 }],
  ['tema', { period: 20 }],
];
const FIVE_TYPES = FIVE_MA_MIX.map(([t]) => t);
/** Provisional target line: TEMA (most sensitive). PO override: M21_VY_PRIMARY_TYPE. */
const PRIMARY_TYPE = (() => {
  const raw = String(process.env.M21_VY_PRIMARY_TYPE || 'tema').trim().toLowerCase();
  if (!FIVE_TYPES.includes(raw)) {
    throw new Error(
      `M21-VY SETUP-FAIL: M21_VY_PRIMARY_TYPE must be one of ${FIVE_TYPES.join(',')}; got ${raw}`,
    );
  }
  return raw;
})();
const PRIMARY_TYPE_SOURCE = process.env.M21_VY_PRIMARY_TYPE
  ? 'env:M21_VY_PRIMARY_TYPE'
  : 'default:tema-provisional-most-sensitive';

const DEPLOYED_ORIGIN = (() => {
  try {
    return normalizeDeployedOrigin(process.env.M19_DEPLOYED_ORIGIN);
  } catch (err) {
    throw new Error(`M21-VY SETUP-FAIL: ${err?.message || err}`);
  }
})();
const DEPLOYED_MODE = Boolean(DEPLOYED_ORIGIN);

const AUTH = {
  email: String(process.env.TEST_EMAIL || process.env.L2_M1_TEST_EMAIL || '').trim(),
  password: String(process.env.TEST_PASSWORD || process.env.L2_M1_TEST_PASSWORD || '').trim(),
  vps: String(process.env.TEST_VPS_URL || '').replace(/\/$/, ''),
};
const AUTH_BOUND_READY = Boolean(AUTH.email && AUTH.password && AUTH.vps);

function resolveExpectedBuildId() {
  const fromEnv = String(process.env.M19_EXPECTED_BUILD_ID || '').trim();
  if (/^\d{8}b\d+$/.test(fromEnv)) {
    return { expectedBuildId: fromEnv, source: 'env:M19_EXPECTED_BUILD_ID' };
  }
  if (DEPLOYED_MODE) {
    throw new Error(
      'M21-VY SETUP-FAIL: M19_DEPLOYED_ORIGIN requires explicit M19_EXPECTED_BUILD_ID',
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
  return tryParse(CHART_JS_PATH, [/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/], 'chart.js')
    || tryParse(SERVE_MJS_PATH, [/const\s+buildId\s*=\s*['"](\d{8}b\d+)['"]/], 'serve.mjs')
    || (() => { throw new Error('M21-VY SETUP-FAIL: cannot resolve expected build ID'); })();
}

const { expectedBuildId: EXPECTED_BUILD_ID, source: EXPECTED_BUILD_SOURCE } = resolveExpectedBuildId();

/** Pre-document kill-switch flags (W1 A/B). Fail closed on invalid env. */
const PREDOC_PARSED = resolvePredocFlagsFromEnv(process.env);
if (!PREDOC_PARSED.ok) {
  process.stderr.write(`M21-VY SETUP-FAIL: ${PREDOC_PARSED.error}\n`);
  process.exitCode = 2;
  process.exit(2);
}
const PREDOC_EVIDENCE = predocEvidenceStub(PREDOC_PARSED);
PREDOC_EVIDENCE.envPresent = String(process.env.M21_VY_PREDOC_FLAGS || '').trim().length > 0;

async function verifyUpstreamDeployedBuild(origin, expectedBuildId) {
  const engineUrl = `${origin}/chart/chart.js`;
  const res = await fetch(engineUrl, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`M21-VY SETUP-FAIL: HTTP ${res.status} ${engineUrl}`);
  const text = await res.text();
  const m = text.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
  if (!m) throw new Error('M21-VY SETUP-FAIL: upstream build unobservable');
  if (m[1] !== expectedBuildId) {
    throw new Error(`M21-VY SETUP-FAIL: build mismatch observed=${m[1]} expected=${expectedBuildId}`);
  }
  return { upstreamObservedBuild: m[1] };
}

function installPreDocumentHooks() {
  return {
    fn: () => {
      if (window.__m21vyInstalled) return;
      window.__m21vyInstalled = true;
      window.__m21vySink = {
        role: null,
        frames: [],
        sampling: false,
        captureDraws: false,
        strokeTips: [],
        lastStrokeTips: [],
        tipYHint: null,
      };

      const proto = CanvasRenderingContext2D.prototype;
      if (!proto.__m21vyWrapped) {
        const origMoveTo = proto.moveTo;
        const origLineTo = proto.lineTo;
        const origStroke = proto.stroke;
        let pathMaxX = -Infinity;
        let pathMaxY = null;
        let pathPoints = 0;

        const inPlotBand = (x, y) => {
          const chart = window.chart;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          const m = chart?.margin || { t: 30, b: 30, l: 10, r: 10 };
          const h = Number(chart?.h) || 0;
          const w = Number(chart?.w) || 0;
          const y0 = (m.t || 30) + 8;
          const y1 = h > 0 ? h - (m.b || 30) - 8 : Infinity;
          const x0 = (m.l || 0) - 5;
          const x1 = w > 0 ? w - (m.r || 0) + 5 : Infinity;
          return y >= y0 && y <= y1 && x >= x0 && x <= x1;
        };

        proto.moveTo = function m21vyMoveTo(x, y, ...rest) {
          const sink = window.__m21vySink;
          if (sink && sink.captureDraws) {
            const nx = Number(x);
            const ny = Number(y);
            if (inPlotBand(nx, ny)) {
              if (nx >= pathMaxX) {
                pathMaxX = nx;
                pathMaxY = ny;
              }
              pathPoints += 1;
            }
          }
          return origMoveTo.call(this, x, y, ...rest);
        };
        proto.lineTo = function m21vyLineTo(x, y, ...rest) {
          const sink = window.__m21vySink;
          if (sink && sink.captureDraws) {
            const nx = Number(x);
            const ny = Number(y);
            if (inPlotBand(nx, ny)) {
              if (nx >= pathMaxX) {
                pathMaxX = nx;
                pathMaxY = ny;
              }
              pathPoints += 1;
            }
          }
          return origLineTo.call(this, x, y, ...rest);
        };
        proto.stroke = function m21vyStroke(...args) {
          const sink = window.__m21vySink;
          if (sink && sink.captureDraws && pathPoints > 0 && Number.isFinite(pathMaxX)) {
            sink.strokeTips.push({
              x: pathMaxX,
              y: pathMaxY,
              points: pathPoints,
              at: performance.now(),
            });
          }
          pathMaxX = -Infinity;
          pathMaxY = null;
          pathPoints = 0;
          return origStroke.apply(this, args);
        };
        proto.__m21vyWrapped = true;
      }
    },
  };
}

const INSTRUMENT_FN = () => {
  const chart = window.chart;
  const sink = window.__m21vySink;
  if (!chart || !sink) return { ok: false, reason: 'missing chart/sink' };

  const tol = () => ({
    MAX_Y_PX: Number(window.__m21vyMaxYPx) || 2.5,
    MAX_VALUE_ABS: Number(window.__m21vyMaxValueAbs) || 1e-5,
    MAX_VALUE_REL: Number(window.__m21vyMaxValueRel) || 1e-6,
  });

  const computeExpectedTipsLocal = (bars, formingClose, period = 20) => {
    const n = bars.length;
    if (n < period) return null;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
      let c = Number(bars[i]?.c);
      if (i === n - 1 && Number.isFinite(formingClose)) c = formingClose;
      closes[i] = Number.isFinite(c) ? c : null;
    }
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
        if (arr[i] != null && Number.isFinite(arr[i])) return { idx: i, val: arr[i] };
      }
      return { idx: -1, val: null };
    };
    return {
      sma: tipOf(sma),
      ema: tipOf(ema1),
      wma: tipOf(wma),
      dema: tipOf(dema),
      tema: tipOf(tema),
    };
  };

  const wrapDraw = (fnName) => {
    const orig = chart[fnName];
    if (typeof orig !== 'function' || orig[`__m21vyWrapped`]) return;
    chart[fnName] = function m21vyWrapped(...args) {
      sink.captureDraws = true;
      sink.strokeTips = [];
      try {
        return orig.apply(this, args);
      } finally {
        sink.captureDraws = false;
        sink.lastStrokeTips = sink.strokeTips.slice();
        sink.lastDrawAt = performance.now();
      }
    };
    chart[fnName].__m21vyWrapped = true;
  };
  wrapDraw('drawIndicators');
  wrapDraw('drawIndicatorsOptimized');

  const sampleFrame = (kind) => {
    const { MAX_Y_PX: maxYPx, MAX_VALUE_ABS: maxValAbs, MAX_VALUE_REL: maxValRel } = tol();
    const priceBars = Array.isArray(chart.data) ? chart.data.length : 0;
    const priceIdx = priceBars - 1;
    const lastBar = priceBars > 0 ? chart.data[priceIdx] : null;
    const priceClose = lastBar ? Number(lastBar.c) : null;
    const anim = chart.replaySystem?.animatingCandle;
    const animClose = anim ? Number(anim.close) : null;
    const formingClose = Number.isFinite(animClose) ? animClose : priceClose;
    const workerBusy = !!chart._indicatorWorkerBusy;

    const expected = computeExpectedTipsLocal(chart.data || [], formingClose, 20);
    if (!expected) {
      return {
        at: performance.now(),
        kind,
        role: sink.role,
        ok: false,
        painted: false,
        oracleOk: false,
        rejectReason: 'expected-tips-unavailable',
        reason: 'expected tips unavailable',
      };
    }

    const strokes = Array.isArray(sink.lastStrokeTips) ? sink.lastStrokeTips.slice() : [];
    const candleW = Math.max(2, Number(chart.candleWidth) || 6);
    let priceX = null;
    try { priceX = Number(chart.dataIndexToPixel(priceIdx)); } catch (_e) { /* */ }

    // Pair tip-column stroke endpoints to expected tips by sorted Y (order-stable
    // under uniform lag). Match by X proximity to last candle — NOT by closeness
    // to expected Y (that would hide staleness).
    const nearTips = strokes.filter((s) => (
      Number.isFinite(s.x) && Number.isFinite(s.y)
      && Number.isFinite(priceX)
      && Math.abs(s.x - priceX) <= candleW * 2.5
    ));
    nearTips.sort((a, b) => a.y - b.y);

    const expectedList = [];
    for (const t of ['sma', 'ema', 'wma', 'dema', 'tema']) {
      const tip = expected[t];
      if (!tip || tip.val == null || tip.idx < 0) continue;
      let expY = null;
      try { expY = Number(chart.yScale(tip.val)); } catch (_e) { /* */ }
      if (!Number.isFinite(expY)) continue;
      expectedList.push({ t, tip, expY });
    }
    expectedList.sort((a, b) => a.expY - b.expY);

    const perType = {};
    let maxAbsYPx = 0;
    let maxAbsValue = 0;
    let matched = 0;
    let staleTypes = 0;
    const pairN = Math.min(nearTips.length, expectedList.length);
    for (let i = 0; i < expectedList.length; i++) {
      const { t, tip, expY } = expectedList[i];
      const best = i < pairN ? nearTips[i] : null;
      let drawnY = best ? best.y : null;
      let drawnVal = null;
      if (drawnY != null && chart.yScale && typeof chart.yScale.invert === 'function') {
        try { drawnVal = Number(chart.yScale.invert(drawnY)); } catch (_e) { /* */ }
      }
      const absYPx = (drawnY != null) ? Math.abs(drawnY - expY) : null;
      const absVal = (drawnVal != null && tip.val != null)
        ? Math.abs(drawnVal - tip.val)
        : null;
      const scale = Math.max(1e-12, Math.abs(tip.val || 0));
      const valueOk = absVal != null
        && (absVal <= maxValAbs || absVal <= scale * maxValRel);
      const yOk = absYPx != null && absYPx <= maxYPx;
      const valueStale = drawnY != null && !(yOk && valueOk);
      if (drawnY != null) matched += 1;
      if (absYPx != null) maxAbsYPx = Math.max(maxAbsYPx, absYPx);
      if (absVal != null) maxAbsValue = Math.max(maxAbsValue, absVal);
      if (valueStale) staleTypes += 1;
      perType[t] = {
        matched: drawnY != null,
        expectedIdx: tip.idx,
        expectedVal: tip.val,
        expectedY: expY,
        drawnX: best ? best.x : null,
        drawnY,
        drawnVal,
        absYPx,
        absVal,
        yOk,
        valueOk,
        valueStale,
        pairMethod: 'sortY-at-priceX',
      };
    }
    for (const t of ['sma', 'ema', 'wma', 'dema', 'tema']) {
      if (!perType[t]) perType[t] = { matched: false };
    }

    const primaryType = String(window.__m21vyPrimaryType || 'tema');
    const primary = perType[primaryType] || {};
    const tema = perType.tema || {};
    const valueStale = !!primary.valueStale
      || (staleTypes >= 2); // ≥2 of five-MA stale ⇒ frame stale
    let rejectReason = null;
    if (!Number.isFinite(priceX)) rejectReason = 'priceX-unavailable';
    else if (strokes.length === 0) rejectReason = 'no-stroke-tips';
    else if (nearTips.length === 0) rejectReason = 'no-tip-column-strokes';
    else if (expectedList.length < 3) rejectReason = 'expected-tips-short';
    else if (matched < 3) rejectReason = `matched-types-lt3:${matched}`;
    else if (!primary.matched) rejectReason = `primary-unmatched:${primaryType}`;
    const oracleOk = matched >= 3 && primary.matched === true;
    if (oracleOk) rejectReason = null;
    else if (!rejectReason) rejectReason = 'oracle-gate-failed';

    const painted = strokes.length > 0;
    return {
      at: performance.now(),
      kind: kind || 'sample',
      role: sink.role || 'unknown',
      priceBars,
      priceIdx,
      formingClose,
      priceClose,
      tickProgress: Number(chart.replaySystem?.tickProgress) || 0,
      fastMode: !!chart.replaySystem?.fastMode,
      playbackMode: chart.replaySystem?.getPlaybackMode
        ? chart.replaySystem.getPlaybackMode()
        : chart.replaySystem?.playbackMode,
      workerBusy,
      strokeCount: strokes.length,
      tipColumnStrokeCount: nearTips.length,
      matchedTypes: matched,
      maxAbsYPx,
      maxAbsValue,
      primaryType,
      primaryAbsYPx: primary.absYPx ?? null,
      primaryAbsVal: primary.absVal ?? null,
      primaryExpectedVal: primary.expectedVal ?? null,
      primaryDrawnVal: primary.drawnVal ?? null,
      primaryDrawnY: primary.drawnY ?? null,
      primaryExpectedY: primary.expectedY ?? null,
      // TEMA diagnostics retained even when primary overridden.
      temaAbsYPx: tema.absYPx ?? null,
      temaAbsVal: tema.absVal ?? null,
      temaExpectedVal: tema.expectedVal ?? null,
      temaDrawnVal: tema.drawnVal ?? null,
      temaDrawnY: tema.drawnY ?? null,
      temaExpectedY: tema.expectedY ?? null,
      valueStale,
      painted,
      oracleOk,
      rejectReason,
      perType,
      indRenderVersion: chart._indicatorRenderVersion ?? null,
      dataVersion: chart.dataVersion ?? null,
      lastDrawAt: sink.lastDrawAt ?? null,
      drawAgeMs: sink.lastDrawAt != null ? performance.now() - sink.lastDrawAt : null,
    };
  };

  sink.sampleFrame = sampleFrame;

  if (!chart.render?.__m21vyWrapped && typeof chart.render === 'function') {
    const origRender = chart.render.bind(chart);
    chart.render = function m21vyRender(...args) {
      const ret = origRender(...args);
      try {
        if (sink.sampling) sink.frames.push(sampleFrame('render'));
      } catch (_e) { /* */ }
      return ret;
    };
    chart.render.__m21vyWrapped = true;
  }

  return { ok: true, role: sink.role };
};

// Patch: INSTRUMENT_FN uses MAX_* before they're set on window — inject properly.
async function wireInstrument(target, tols) {
  await target.evaluate((tols) => {
    window.__m21vyMaxYPx = tols.MAX_Y_PX;
    window.__m21vyMaxValueAbs = tols.MAX_VALUE_ABS;
    window.__m21vyMaxValueRel = tols.MAX_VALUE_REL;
    window.__m21vyPrimaryType = tols.PRIMARY_TYPE;
  }, tols);
  const base = await target.evaluate(INSTRUMENT_FN);
  // Harness-only apply-tip fingerprint (no product behavior change).
  await target.evaluate(() => {
    const chart = window.chart;
    const sink = window.__m21vySink;
    if (!chart || !sink || typeof chart._applyIndicatorWorkerResults !== 'function') return;
    if (chart._applyIndicatorWorkerResults.__m21vyFpWrapped) return;
    const orig = chart._applyIndicatorWorkerResults.bind(chart);
    chart._applyIndicatorWorkerResults = function m21vyFpApply(results, mySeq, calcToken, tailMeta) {
      const anim = chart.replaySystem?.animatingCandle;
      const last = Array.isArray(chart.data) && chart.data.length
        ? chart.data[chart.data.length - 1] : null;
      const formingClose = anim && Number.isFinite(Number(anim.close))
        ? Number(anim.close)
        : (last ? Number(last.c) : null);
      let applyTemaTip = null;
      let applyTipSource = 'UNOBSERVED';
      try {
        const tema = (chart.indicators?.active || [])
          .find((i) => String(i?.type || '').toLowerCase() === 'tema');
        const pack = tema?.id != null && results ? results[tema.id] : null;
        const readTip = (p) => {
          if (Array.isArray(p)) {
            for (let i = p.length - 1; i >= 0; i--) {
              const v = Number(p[i]);
              if (Number.isFinite(v)) return v;
            }
          } else if (p && typeof p === 'object') {
            const arr = p.values || p.data || p.line || p.y;
            if (Array.isArray(arr)) {
              for (let i = arr.length - 1; i >= 0; i--) {
                const v = Number(arr[i]);
                if (Number.isFinite(v)) return v;
              }
            }
          }
          return null;
        };
        const tip = readTip(pack);
        if (tip != null) {
          applyTemaTip = tip;
          applyTipSource = 'worker_apply_results_pack';
        }
      } catch (_e) {
        applyTipSource = 'UNOBSERVED';
      }
      sink.lastApplyTip = {
        at: performance.now(),
        mySeq: mySeq ?? null,
        seqNow: chart._indicatorWorkerSeq ?? null,
        formingClose: Number.isFinite(formingClose) ? formingClose : null,
        applyTemaTip,
        applyTipFingerprint: applyTemaTip != null
          ? `tema|${applyTemaTip}|${Number.isFinite(formingClose) ? formingClose : 'na'}`
          : null,
        applyTipSource,
        hasTailMeta: !!tailMeta,
      };
      return orig(results, mySeq, calcToken, tailMeta);
    };
    chart._applyIndicatorWorkerResults.__m21vyFpWrapped = true;
  });
  return base;
}

async function setupHost(page) {
  return page.evaluate(async ({ startOffset, mix, types }) => {
    const sink = window.__m21vySink;
    if (sink) sink.role = 'HOST';

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
    if (fine.length < 129_000) return { ok: false, reason: `fine too short: ${fine.length}` };

    const chart = window.chart;
    const replay = chart?.replaySystem;
    if (!chart || !replay) return { ok: false, reason: 'missing chart/replay' };

    try { if (replay.isPlaying) replay.pause(); } catch (_) {}

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
    replay.playbackMode = 'tick';
    replay.tickAnimationEnabled = true;
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

    try {
      for (const id of (chart.indicators?.active || []).map((i) => i.id)) {
        chart.removeIndicator?.(id);
      }
    } catch (_e) { /* */ }

    const added = [];
    for (const [type, params] of mix) {
      try {
        const ind = chart.addIndicator(type, params);
        added.push({ type, id: ind?.id || null, ok: true, period: params.period });
      } catch (err) {
        added.push({ type, ok: false, error: String(err?.message || err) });
      }
    }
    const activeTypes = (chart.indicators?.active || [])
      .map((i) => String(i.type || '').toLowerCase());
    const mixOk = types.every((t) => activeTypes.includes(t));

    let engineBuildId = null;
    try {
      const engRes = await fetch('/chart/chart.js', { cache: 'no-store' });
      if (engRes.ok) {
        const m = (await engRes.text()).match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
        engineBuildId = m ? m[1] : null;
      }
    } catch (_e) { /* */ }

    return {
      ok: mixOk,
      reason: mixOk ? null : 'five-MA mix incomplete on HOST',
      buildId: engineBuildId || window.__TALARIA_CHART_BUILD_ID || null,
      fineCount: fine.length,
      startIndex,
      activeTypes,
      added,
      indicatorCount: (chart.indicators?.active || []).length,
      playbackMode: replay.playbackMode,
    };
  }, { startOffset: START_INDEX_OFFSET, mix: FIVE_MA_MIX, types: FIVE_TYPES });
}

async function setupPanel(frame, panelId) {
  return frame.evaluate(async ({ mix, types, panelId }) => {
    const sink = window.__m21vySink;
    if (sink) sink.role = `PANEL-${panelId}`;
    const chart = window.chart;
    if (!chart?.addIndicator) return { ok: false, reason: 'no chart', panelId };
    try {
      for (const id of (chart.indicators?.active || []).map((i) => i.id)) {
        chart.removeIndicator?.(id);
      }
    } catch (_e) { /* */ }
    for (const [type, params] of mix) {
      try { chart.addIndicator(type, params); } catch (_e) { /* */ }
    }
    const activeTypes = (chart.indicators?.active || [])
      .map((i) => String(i.type || '').toLowerCase());
    const mixOk = types.every((t) => activeTypes.includes(t));
    const replay = chart.replaySystem;
    if (replay) {
      replay.playbackMode = 'tick';
      replay.tickAnimationEnabled = true;
      replay.isActive = true;
    }
    return {
      ok: mixOk,
      panelId,
      activeTypes,
      indicatorCount: (chart.indicators?.active || []).length,
      dataLen: Array.isArray(chart.data) ? chart.data.length : 0,
    };
  }, { mix: FIVE_MA_MIX, types: FIVE_TYPES, panelId });
}

async function forcePrime(target) {
  return target.evaluate(() => {
    const chart = window.chart;
    try { chart?.recalculateIndicators?.(); } catch (_e) { /* */ }
    try {
      chart?.drawIndicators?.() || chart?.drawIndicatorsOptimized?.();
    } catch (_e) { /* */ }
    try { chart?.render?.(); } catch (_e) { /* */ }
    const sink = window.__m21vySink;
    return {
      ok: true,
      strokes: sink?.lastStrokeTips?.length || 0,
    };
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function classifyCaptureDensity(diag, { minEvaluated = MIN_EVALUATED, minCoverage = MIN_ORACLE_COVERAGE } = {}) {
  const attempted = diag.attemptedCount || 0;
  const painted = diag.paintedCount || 0;
  const matched = diag.matchedCount || 0;
  const coverage = attempted > 0 ? matched / attempted : 0;
  const densityOk = matched >= minEvaluated && coverage >= minCoverage;
  if (densityOk) {
    return {
      class: 'DENSITY-OK',
      densityOk: true,
      note: 'Enough matched frames under fixed wall clock; gates unchanged.',
    };
  }
  // High match rate among attempts, but absolute attempts too low for gate.
  if (coverage >= 0.85 && matched < minEvaluated && attempted >= Math.floor(minEvaluated * 0.7)) {
    return {
      class: 'PROBE-SCHEDULING-CAPTURE-JITTER',
      densityOk: false,
      note: 'Oracle match rate high; absolute RAF/render sample count under fixed playMs '
        + 'missed minEvaluated — scheduling/capture density, not painted-endpoint match failure.',
    };
  }
  if (attempted < Math.floor(minEvaluated * 0.7)) {
    return {
      class: 'PROBE-SCHEDULING-LOW-ATTEMPT-RATE',
      densityOk: false,
      note: 'Too few sample attempts in fixed playMs (RAF/render starvation / contention).',
    };
  }
  if (painted < Math.floor(attempted * 0.5)) {
    return {
      class: 'PAINTED-STROKE-SPARSE',
      densityOk: false,
      note: 'Many attempts saw no indicator stroke tips — draw path sparse or not capturing.',
    };
  }
  if (coverage < minCoverage) {
    return {
      class: 'ORACLE-MATCH-REJECTION',
      densityOk: false,
      note: 'Attempts present but rejectReasons dominate — pairing/match gate, not mere scheduling.',
    };
  }
  return {
    class: 'DENSITY-SHORT-UNCLASSIFIED',
    densityOk: false,
    note: 'Density short under fixed playMs; see rejectReasons + intervals.',
  };
}

function summarizeValueFrames(frames) {
  const attempted = frames.filter((f) => f && typeof f === 'object');
  const painted = attempted.filter((f) => f.painted === true || (f.strokeCount || 0) > 0);
  const evaluated = attempted.filter((f) => (
    f.oracleOk === true
    && (f.primaryAbsYPx != null || f.temaAbsYPx != null)
  ));
  let maxAbsYPx = 0;
  let maxAbsVal = 0;
  let maxTemaAbsYPx = 0;
  let maxTemaAbsVal = 0;
  let staleFrames = 0;
  let staleBusyFrames = 0;
  let maxConsecStale = 0;
  let maxConsecStaleBusy = 0;
  let consec = 0;
  let consecBusy = 0;
  let workerBusyFrames = 0;
  const perIndicator = {};
  for (const t of FIVE_TYPES) {
    perIndicator[t] = {
      matchedFrames: 0,
      staleFrames: 0,
      maxAbsYPx: 0,
      maxAbsVal: 0,
      sumAbsYPx: 0,
      sumAbsVal: 0,
    };
  }

  const rejectReasons = {};
  const kindCounts = {};
  for (const f of attempted) {
    const k = f.kind || 'unknown';
    kindCounts[k] = (kindCounts[k] || 0) + 1;
    if (!f.oracleOk) {
      const rr = f.rejectReason || 'unspecified';
      rejectReasons[rr] = (rejectReasons[rr] || 0) + 1;
    }
  }

  for (const f of evaluated) {
    const pAbs = f.primaryAbsYPx != null ? f.primaryAbsYPx : f.temaAbsYPx;
    const pVal = f.primaryAbsVal != null ? f.primaryAbsVal : f.temaAbsVal;
    maxAbsYPx = Math.max(maxAbsYPx, pAbs || 0);
    maxAbsVal = Math.max(maxAbsVal, pVal || 0);
    maxTemaAbsYPx = Math.max(maxTemaAbsYPx, f.temaAbsYPx || 0);
    maxTemaAbsVal = Math.max(maxTemaAbsVal, f.temaAbsVal || 0);
    if (f.workerBusy) workerBusyFrames += 1;
    if (f.valueStale) {
      staleFrames += 1;
      consec += 1;
      maxConsecStale = Math.max(maxConsecStale, consec);
      if (f.workerBusy) {
        staleBusyFrames += 1;
        consecBusy += 1;
        maxConsecStaleBusy = Math.max(maxConsecStaleBusy, consecBusy);
      } else {
        consecBusy = 0;
      }
    } else {
      consec = 0;
      consecBusy = 0;
    }
    if (f.perType && typeof f.perType === 'object') {
      for (const t of FIVE_TYPES) {
        const pt = f.perType[t];
        if (!pt || !pt.matched) continue;
        const bucket = perIndicator[t];
        bucket.matchedFrames += 1;
        if (pt.valueStale) bucket.staleFrames += 1;
        if (pt.absYPx != null) {
          bucket.maxAbsYPx = Math.max(bucket.maxAbsYPx, pt.absYPx);
          bucket.sumAbsYPx += pt.absYPx;
        }
        if (pt.absVal != null) {
          bucket.maxAbsVal = Math.max(bucket.maxAbsVal, pt.absVal);
          bucket.sumAbsVal += pt.absVal;
        }
      }
    }
  }
  const n = evaluated.length;
  for (const t of FIVE_TYPES) {
    const b = perIndicator[t];
    const m = b.matchedFrames || 0;
    b.staleRatio = m > 0 ? b.staleFrames / m : null;
    b.meanAbsYPx = m > 0 ? b.sumAbsYPx / m : null;
    b.meanAbsVal = m > 0 ? b.sumAbsVal / m : null;
    b.redAtDefault = (b.maxAbsYPx || 0) > MAX_Y_PX
      || (b.staleRatio != null && b.staleRatio > MAX_STALE_RATIO);
  }

  // Threshold sensitivity on primary absYPx distribution (same frames, no re-run).
  const primaryYs = evaluated.map((f) => (
    f.primaryAbsYPx != null ? f.primaryAbsYPx : f.temaAbsYPx
  )).filter((v) => v != null);
  const sensitivity = {};
  for (const thr of [1.0, 2.5, 5.0, 10.0, 15.0]) {
    const fail = primaryYs.filter((y) => y > thr).length;
    sensitivity[`maxYPx_${thr}`] = {
      threshold: thr,
      failFrames: fail,
      failRatio: primaryYs.length ? fail / primaryYs.length : null,
      wouldRed: primaryYs.length >= MIN_EVALUATED && (fail / primaryYs.length) > MAX_STALE_RATIO,
    };
  }

  const ts = attempted.map((f) => f.at).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const intervals = [];
  for (let i = 1; i < ts.length; i++) intervals.push(ts[i] - ts[i - 1]);
  const intervalsSorted = intervals.slice().sort((a, b) => a - b);
  const spanMs = ts.length >= 2 ? ts[ts.length - 1] - ts[0] : null;
  const captureDiagnostics = {
    attemptedCount: attempted.length,
    paintedCount: painted.length,
    matchedCount: n,
    rejectedCount: attempted.length - n,
    oracleCoverage: attempted.length > 0 ? n / attempted.length : 0,
    paintedRatio: attempted.length > 0 ? painted.length / attempted.length : 0,
    kindCounts,
    rejectReasons,
    frameTimestampsHead: ts.slice(0, 5),
    frameTimestampsTail: ts.slice(-5),
    sampleSpanMs: spanMs,
    intervalMs: {
      ...stats(intervals),
      p50: percentile(intervalsSorted, 0.5),
      p90: percentile(intervalsSorted, 0.9),
      p95: percentile(intervalsSorted, 0.95),
    },
    effectiveSampleHz: spanMs > 0 ? (attempted.length / (spanMs / 1000)) : null,
  };
  const densityClass = classifyCaptureDensity(captureDiagnostics);

  // Warmup vs steady split (diagnostic only — does not alter gates / evaluated set).
  const t0 = ts.length ? ts[0] : null;
  const WARMUP_MS = 3_000;
  const phaseStats = (subset) => {
    const ys = subset.map((f) => (
      f.primaryAbsYPx != null ? f.primaryAbsYPx : f.temaAbsYPx
    )).filter((v) => v != null);
    const staleN = subset.filter((f) => f.valueStale).length;
    const tipCols = subset.map((f) => f.tipColumnStrokeCount).filter((v) => v != null);
    const matchedNs = subset.map((f) => f.matchedTypes).filter((v) => v != null);
    return {
      n: subset.length,
      maxAbsYPx: ys.length ? Math.max(...ys) : null,
      meanAbsYPx: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null,
      staleRatio: subset.length ? staleN / subset.length : null,
      tipColumnStrokeCount: stats(tipCols),
      matchedTypes: stats(matchedNs),
    };
  };
  const early = (t0 != null)
    ? evaluated.filter((f) => Number.isFinite(f.at) && f.at < t0 + WARMUP_MS)
    : [];
  const late = (t0 != null)
    ? evaluated.filter((f) => Number.isFinite(f.at) && f.at >= t0 + WARMUP_MS)
    : evaluated;
  const phaseSplit = {
    warmupMs: WARMUP_MS,
    early: phaseStats(early),
    late: phaseStats(late),
  };

  // Tip-assignment ambiguity heuristic (diagnostic): tip-column stroke count != 5
  // on many frames, or early/late tip counts diverge sharply.
  const tipAmbiguityFrames = evaluated.filter((f) => (
    f.tipColumnStrokeCount != null && f.tipColumnStrokeCount !== 5
  )).length;
  const tipAssignmentAmbiguity = {
    nonFiveTipColumnFrames: tipAmbiguityFrames,
    nonFiveTipColumnRatio: n > 0 ? tipAmbiguityFrames / n : null,
    suspected: n >= 10 && (tipAmbiguityFrames / n) > 0.25,
  };

  return {
    rawFrameCount: frames.length,
    evaluatedCount: n,
    oracleCoverage: frames.length > 0 ? n / frames.length : 0,
    primaryType: PRIMARY_TYPE,
    maxPrimaryAbsYPx: maxAbsYPx,
    maxPrimaryAbsVal: maxAbsVal,
    maxTemaAbsYPx: maxTemaAbsYPx,
    maxTemaAbsVal: maxTemaAbsVal,
    staleFrames,
    staleRatio: n > 0 ? staleFrames / n : 1,
    staleBusyFrames,
    maxConsecStale,
    maxConsecStaleBusy,
    workerBusyFrames,
    perIndicator,
    thresholdSensitivity: sensitivity,
    captureDiagnostics,
    densityClass,
    phaseSplit,
    tipAssignmentAmbiguity,
    sampleHead: evaluated.slice(0, 2),
    sampleTail: evaluated.slice(-2),
    firstStale: evaluated.find((f) => f.valueStale) || null,
    firstStaleBusy: evaluated.find((f) => f.valueStale && f.workerBusy) || null,
  };
}

/**
 * Attribute elevated endpoint delta at control speed vs a clean prior baseline.
 * Does NOT accept RED/GREEN — classification only.
 */
function classifyElevatedEndpoint({
  speed,
  densityOk,
  densityClass,
  paintedRed,
  maxPrimaryAbsYPx,
  staleRatio,
  phaseSplit,
  tipAssignmentAmbiguity,
  captureDiagnostics,
  priorCleanMaxY = 0.5022703442536596,
  priorCleanStale = 0,
}) {
  const densClass = densityClass?.class || 'UNKNOWN';
  if (!densityOk || String(densClass).includes('SCHEDULING') || String(densClass).includes('JITTER')
    || String(densClass).includes('LOW-ATTEMPT')) {
    return {
      class: 'CAPTURE-STARVATION-OR-DENSITY-SHORT',
      paintedEligible: false,
      note: 'Density short / scheduling — endpoint delta not attributed to painted behavior.',
    };
  }
  if (tipAssignmentAmbiguity?.suspected) {
    return {
      class: 'TIP-ASSIGNMENT-AMBIGUITY',
      paintedEligible: true,
      note: 'Many frames had tip-column stroke count ≠ 5; sortY pairing may be ambiguous.',
      tipAssignmentAmbiguity,
    };
  }
  const earlyMax = phaseSplit?.early?.maxAbsYPx;
  const lateMax = phaseSplit?.late?.maxAbsYPx;
  const earlyN = phaseSplit?.early?.n || 0;
  const lateN = phaseSplit?.late?.n || 0;
  const elevated = (maxPrimaryAbsYPx || 0) > MAX_Y_PX
    || (staleRatio || 0) > MAX_STALE_RATIO;
  if (!elevated && (maxPrimaryAbsYPx || 0) <= Math.max(priorCleanMaxY * 2, MAX_Y_PX)) {
    return {
      class: 'CONTROL-CLEAN-VS-PRIOR',
      paintedEligible: true,
      paintedRed: false,
      note: `Within prior clean envelope (prior maxY≈${priorCleanMaxY.toFixed(3)}, stale=${priorCleanStale}).`,
      priorCleanMaxY,
      maxPrimaryAbsYPx,
    };
  }
  // Warmup-dominant: early exceeds gate, late stays near prior clean / under gate.
  if (
    earlyN >= 5
    && lateN >= 20
    && earlyMax != null
    && lateMax != null
    && earlyMax > MAX_Y_PX
    && lateMax <= MAX_Y_PX
  ) {
    return {
      class: 'STARTUP-WARMUP-DOMINANT',
      paintedEligible: true,
      paintedRed,
      note: 'Early (first 3s) exceeds Y gate; late/steady window does not — startup/warmup.',
      earlyMax,
      lateMax,
    };
  }
  if (elevated && lateMax != null && lateMax > MAX_Y_PX) {
    return {
      class: 'ACTUAL-PAINTED-BEHAVIOR-PRELIMINARY',
      paintedEligible: true,
      paintedRed: true,
      note: 'Steady-window (post-3s) still exceeds Y/stale gates under DENSITY-OK — painted endpoint candidate (not accepted).',
      earlyMax,
      lateMax,
      maxPrimaryAbsYPx,
      staleRatio,
      speed,
    };
  }
  if (elevated) {
    return {
      class: 'ELEVATED-ENDPOINT-MIXED-PRELIMINARY',
      paintedEligible: true,
      paintedRed,
      note: 'Elevated vs prior clean baseline; phase split inconclusive — needs GPT-5.6 review.',
      earlyMax,
      lateMax,
      maxPrimaryAbsYPx,
      staleRatio,
      rejectReasons: captureDiagnostics?.rejectReasons || {},
    };
  }
  return {
    class: 'ENDPOINT-WITHIN-GATES',
    paintedEligible: true,
    paintedRed: false,
    maxPrimaryAbsYPx,
    staleRatio,
  };
}

function stats(arr) {
  if (!arr.length) return { n: 0, min: null, max: null, mean: null, stdev: null };
  const n = arr.length;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const var_ = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { n, min, max, mean, stdev: Math.sqrt(var_) };
}

async function runCell(page, { speed, playMs, label }) {
  const frames = panelFrameMap(page);
  const panelTargets = PANEL_IDS.map((id) => ({ id, frame: frames[id] })).filter((x) => x.frame);

  await page.evaluate(() => {
    const s = window.__m21vySink;
    if (s) { s.frames = []; s.sampling = false; }
  });
  for (const { frame } of panelTargets) {
    await frame.evaluate(() => {
      const s = window.__m21vySink;
      if (s) { s.frames = []; s.sampling = false; }
    });
  }

  const hostPrep = await page.evaluate(async ({ speed }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m21vySink;
    if (!chart || !replay || !sink) return { ok: false, reason: 'host runtime missing' };
    try { if (replay.isPlaying) replay.pause(); } catch (_) {}
    if (replay.currentIndex > replay.fullRawData.length - 80) {
      replay.currentIndex = Math.max(0, replay.fullRawData.length - 400);
      replay.replayTimestamp = Number(replay.fullRawData[replay.currentIndex].t);
      replay.updateChartData?.(false);
    }
    replay.playbackMode = 'tick';
    replay.tickAnimationEnabled = true;
    // Do not drain worker — need coalesce pressure for value lag.
    try { chart.scheduleReplayIndicatorRecalc?.(true); } catch (_e) { /* */ }
    sink.frames = [];
    sink.sampling = true;
    replay.speed = speed;
    replay.updateSpeedButtonUI?.(speed);
    const idx0 = replay.currentIndex;
    const price0 = chart.data?.length || 0;
    replay.play();
    const armDeadline = performance.now() + 1500;
    while (!replay.isPlaying && performance.now() < armDeadline) {
      await new Promise((r) => setTimeout(r, 16));
    }
    return {
      ok: true,
      playingDuring: !!replay.isPlaying,
      modeDuring: replay.getPlaybackMode?.() || replay.playbackMode,
      effectiveSpeed: replay.getEffectivePlaybackSpeed?.() ?? speed,
      idx0,
      price0,
      workerBusyAtStart: !!chart._indicatorWorkerBusy,
    };
  }, { speed });
  if (!hostPrep?.ok) return { ok: false, reason: hostPrep?.reason || 'host prep failed' };

  for (const { frame } of panelTargets) {
    await frame.evaluate(({ speed }) => {
      const sink = window.__m21vySink;
      const replay = window.chart?.replaySystem;
      if (sink) { sink.frames = []; sink.sampling = true; }
      if (replay) {
        replay.playbackMode = 'tick';
        replay.tickAnimationEnabled = true;
        replay.speed = speed;
        if (replay.isActive && !replay.isPlaying) {
          try { replay.play(); } catch (_e) { /* */ }
        }
      }
    }, { speed });
  }

  const startRaf = () => {
    const sink = window.__m21vySink;
    if (!sink) return;
    let rafId = 0;
    const loop = () => {
      try {
        if (sink.sampling && typeof sink.sampleFrame === 'function') {
          sink.frames.push(sink.sampleFrame('raf'));
        }
      } catch (_e) { /* */ }
      if (sink.sampling) rafId = requestAnimationFrame(loop);
    };
    sink._rafStop = () => {
      sink.sampling = false;
      try { cancelAnimationFrame(rafId); } catch (_e) { /* */ }
    };
    rafId = requestAnimationFrame(loop);
  };
  await page.evaluate(startRaf);
  for (const { frame } of panelTargets) await frame.evaluate(startRaf);

  await sleep(playMs);

  const hostEnd = await page.evaluate(() => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m21vySink;
    try { replay?.pause?.(); } catch (_e) { /* */ }
    try { sink?._rafStop?.(); } catch (_e) { /* */ }
    if (sink) sink.sampling = false;
    return {
      idx1: replay?.currentIndex ?? null,
      price1: chart?.data?.length ?? null,
      frames: sink?.frames?.slice() || [],
    };
  });

  const panels = {};
  for (const { id, frame } of panelTargets) {
    const raw = await frame.evaluate(() => {
      const chart = window.chart;
      const replay = chart?.replaySystem;
      const sink = window.__m21vySink;
      try { replay?.pause?.(); } catch (_e) { /* */ }
      try { sink?._rafStop?.(); } catch (_e) { /* */ }
      if (sink) sink.sampling = false;
      return { frames: sink?.frames?.slice() || [] };
    });
    panels[id] = summarizeValueFrames(raw.frames || []);
  }

  const host = summarizeValueFrames(hostEnd.frames || []);
  const panelStaleRatios = Object.values(panels).map((p) => p.staleRatio || 0);
  const panelMedianStale = panelStaleRatios.length
    ? [...panelStaleRatios].sort((a, b) => a - b)[Math.floor(panelStaleRatios.length / 2)]
    : null;

  return {
    ok: true,
    label,
    speed,
    playMs,
    playingDuring: hostPrep.playingDuring,
    modeDuring: hostPrep.modeDuring,
    effectiveSpeed: hostPrep.effectiveSpeed,
    indexDelta: (hostEnd.idx1 ?? 0) - (hostPrep.idx0 ?? 0),
    priceBarsDelta: (hostEnd.price1 ?? 0) - (hostPrep.price0 ?? 0),
    workerBusyAtStart: hostPrep.workerBusyAtStart,
    host,
    panels,
    panelMedianStale,
    g2HostOnlyValueLag: (host.staleRatio || 0) > MAX_STALE_RATIO
      && (panelMedianStale == null || panelMedianStale <= MAX_STALE_RATIO),
  };
}

function evaluateCell(cell) {
  const h = cell.host || {};
  const maxPrimaryY = h.maxPrimaryAbsYPx != null ? h.maxPrimaryAbsYPx : h.maxTemaAbsYPx;
  const maxPrimaryVal = h.maxPrimaryAbsVal != null ? h.maxPrimaryAbsVal : h.maxTemaAbsVal;
  const asserts = {
    playAdvanced: {
      pass: (cell.indexDelta || 0) >= 1 || (cell.priceBarsDelta || 0) >= 1,
      indexDelta: cell.indexDelta,
      priceBarsDelta: cell.priceBarsDelta,
    },
    hostEvaluatedSamples: {
      pass: (h.evaluatedCount || 0) >= MIN_EVALUATED,
      value: h.evaluatedCount,
      min: MIN_EVALUATED,
    },
    hostOracleCoverage: {
      pass: (h.oracleCoverage || 0) >= MIN_ORACLE_COVERAGE,
      value: h.oracleCoverage,
      min: MIN_ORACLE_COVERAGE,
      note: 'Matched draw-call tip Y vs independent expected tip (not data array)',
    },
    hostPrimaryYPx: {
      pass: (maxPrimaryY || 0) <= MAX_Y_PX,
      value: maxPrimaryY,
      limit: MAX_Y_PX,
      primaryType: h.primaryType || PRIMARY_TYPE,
      justification: `${h.primaryType || PRIMARY_TYPE} drawn Y vs expected Y through active yScale`,
    },
    // Alias retained for prior evidence readers.
    hostTemaYPx: {
      pass: (h.maxTemaAbsYPx || 0) <= MAX_Y_PX,
      value: h.maxTemaAbsYPx,
      limit: MAX_Y_PX,
      justification: 'TEMA drawn Y vs expected Y (diagnostic even if primary overridden)',
    },
    hostPrimaryValue: {
      pass: (maxPrimaryVal || 0) <= Math.max(MAX_VALUE_ABS, 1e-4 * MAX_VALUE_REL * 1e6)
        || (h.staleRatio || 0) <= MAX_STALE_RATIO,
      value: maxPrimaryVal,
      limitAbs: MAX_VALUE_ABS,
      limitRel: MAX_VALUE_REL,
      note: 'Primary RED signal is hostPrimaryYPx + hostValueStaleRatio; value abs is diagnostic',
    },
    hostTemaValue: {
      pass: (h.maxTemaAbsVal || 0) <= Math.max(MAX_VALUE_ABS, 1e-4 * MAX_VALUE_REL * 1e6)
        || (h.staleRatio || 0) <= MAX_STALE_RATIO,
      value: h.maxTemaAbsVal,
      limitAbs: MAX_VALUE_ABS,
      limitRel: MAX_VALUE_REL,
    },
    hostValueStaleRatio: {
      pass: (h.staleRatio || 0) <= MAX_STALE_RATIO,
      value: h.staleRatio,
      limit: MAX_STALE_RATIO,
      staleFrames: h.staleFrames,
    },
    hostConsecStaleBusy: {
      pass: (h.maxConsecStaleBusy || 0) <= MAX_CONSEC_STALE_BUSY,
      value: h.maxConsecStaleBusy,
      limit: MAX_CONSEC_STALE_BUSY,
      note: 'Consecutive value-stale frames while workerBusy',
    },
    tickMode: {
      pass: cell.modeDuring === 'tick',
      modeDuring: cell.modeDuring,
    },
  };
  const densityOk = asserts.hostEvaluatedSamples.pass && asserts.hostOracleCoverage.pass;
  const paintedRed = asserts.hostPrimaryYPx.pass === false
    || asserts.hostPrimaryValue.pass === false
    || asserts.hostValueStaleRatio.pass === false
    || asserts.hostConsecStaleBusy.pass === false
    || cell.g2HostOnlyValueLag === true;
  return {
    asserts,
    densityOk,
    paintedRed,
    densityClass: h.densityClass || null,
    captureDiagnostics: h.captureDiagnostics || null,
  };
}

async function main() {
  const authEscalation = {
    status: AUTH_BOUND_READY ? 'CREDENTIALS-PRESENT' : 'BLOCKED-AUTH-FOR-REAL-PRODUCT-CELL',
    need: {
      TEST_EMAIL: 'dedicated non-admin QA account',
      TEST_PASSWORD: 'matching password',
      TEST_VPS_URL: 'e.g. http://31.97.192.82:3000',
    },
    forbidden: 'admin credentials',
    runner: 'homepage/public/chart/multichart-prod/harness/m21-painted-endpoint-value-y-auth-bound-runner.mjs',
  };

  let upstreamVerify = null;
  if (DEPLOYED_MODE) {
    upstreamVerify = await verifyUpstreamDeployedBuild(DEPLOYED_ORIGIN, EXPECTED_BUILD_ID);
  }

  const server = await startServer();
  if (DEPLOYED_MODE && !server.deployedMode) {
    throw new Error('M21-VY SETUP-FAIL: deployed origin set but server not in deployed mode');
  }

  const tols = { MAX_Y_PX, MAX_VALUE_ABS, MAX_VALUE_REL, PRIMARY_TYPE };
  const browser = await launchBrowser({ headful: false });
  let boot;
  try {
    boot = await bootLayout(browser, server, {
      pair: 'same',
      panels: 4,
      tf: '1m',
      bug: false,
      preDocument: composePredocWithProbe(
        PREDOC_PARSED.noop ? null : buildPredocFlagsHook(PREDOC_PARSED.applied),
        installPreDocumentHooks(),
      ),
    });
    const { page } = boot;

    let predocLive = await page.evaluate(() => {
      const p = window.__m21vyPredoc || null;
      const flag = window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1;
      return {
        sinkPresent: !!p,
        applied: p ? { ...(p.applied || {}) } : {},
        beforeAppAtApply: p ? !!p.beforeApp : null,
        liveExactTailKill: typeof flag === 'boolean' ? flag : (flag === undefined ? null : 'UNOBSERVED'),
        chartPresentAtRead: typeof window.chart !== 'undefined',
      };
    }).catch(() => ({
      sinkPresent: false,
      applied: {},
      beforeAppAtApply: null,
      liveExactTailKill: null,
      chartPresentAtRead: null,
    }));
    PREDOC_EVIDENCE.live = predocLive;
    PREDOC_EVIDENCE.thresholdsUnchanged = {
      MAX_Y_PX,
      MAX_STALE_RATIO,
      MIN_EVALUATED,
      EXPECTED_BUILD_ID,
    };

    const hostSetup = await setupHost(page);
    if (!hostSetup?.ok) throw new Error(hostSetup?.reason || 'host setup failed');
    await wireInstrument(page, tols);
    await forcePrime(page);

    const fmap = panelFrameMap(page);
    const panelSetups = {};
    for (const id of PANEL_IDS) {
      const frame = fmap[id];
      if (!frame) {
        panelSetups[id] = { ok: false, reason: 'missing frame' };
        continue;
      }
      await sleep(200);
      panelSetups[id] = await setupPanel(frame, id);
      await wireInstrument(frame, tols);
      await forcePrime(frame);
    }
    const panelsReady = PANEL_IDS.every((id) => panelSetups[id]?.ok);
    const embedCount = embedFrames(page).length;
    const buildOk = hostSetup.buildId === EXPECTED_BUILD_ID;
    const PREP_MATRIX = String(process.env.M21_VY_PREP_MATRIX || '').trim() === '1';
    const DENSITY_DIAG = String(process.env.M21_VY_DENSITY_DIAG || '').trim() === '1';
    const BOUNDED_MATRIX = String(process.env.M21_VY_BOUNDED_MATRIX || '').trim() === '1';

    let localChartBuild = null;
    try {
      const src = fs.readFileSync(CHART_JS_PATH, 'utf8');
      const m = src.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
      localChartBuild = m ? m[1] : null;
    } catch (_e) { /* */ }

    const buildPin = {
      expectedBuildId: EXPECTED_BUILD_ID,
      expectedBuildSource: EXPECTED_BUILD_SOURCE,
      liveHostBuildId: hostSetup.buildId,
      upstreamObservedBuild: upstreamVerify?.upstreamObservedBuild || null,
      localCheckoutChartBuild: localChartBuild,
      deployedMatchesExpected: buildOk,
      localMatchesExpected: localChartBuild === EXPECTED_BUILD_ID,
      note: 'Harness product assets from deployed origin when M19_DEPLOYED_ORIGIN set; '
        + 'local checkout build may differ and is recorded for variance only.',
    };

    if (BOUNDED_MATRIX) {
      // Predeclared bounded repeat matrix — record EVERY attempt; no cherry-picking.
      // Per speed: max 5 attempts; stop only after 3 DENSITY-OK or max attempts.
      // Fixed playMs=20000; gates unchanged; staged 15 → 60 → 100.
      const PLAY_FIXED = 20_000;
      const MAX_ATTEMPTS = Math.min(5, Math.max(3, Number(process.env.M21_VY_BOUNDED_MAX) || 5));
      const TARGET_DENSITY_OK = Math.min(
        MAX_ATTEMPTS,
        Math.max(3, Number(process.env.M21_VY_BOUNDED_TARGET_OK) || 3),
      );
      const SPEEDS = [15, 60, 100];

      const packageAttempt = (cell, attemptIndex, speed) => {
        const ev = evaluateCell(cell);
        const d = cell.host?.captureDiagnostics || {};
        const maxY = cell.host?.maxPrimaryAbsYPx ?? cell.host?.maxTemaAbsYPx;
        const attribution = classifyElevatedEndpoint({
          speed,
          densityOk: ev.densityOk,
          densityClass: cell.host?.densityClass || ev.densityClass,
          paintedRed: ev.paintedRed,
          maxPrimaryAbsYPx: maxY,
          staleRatio: cell.host?.staleRatio,
          phaseSplit: cell.host?.phaseSplit,
          tipAssignmentAmbiguity: cell.host?.tipAssignmentAmbiguity,
          captureDiagnostics: d,
          priorCleanMaxY: PRIOR_15X_CLEAN_BASELINE.maxTemaAbsYPx,
          priorCleanStale: PRIOR_15X_CLEAN_BASELINE.staleRatio,
        });
        return {
          attemptIndex,
          label: cell.label,
          speed,
          playMs: PLAY_FIXED,
          indexDelta: cell.indexDelta,
          priceBarsDelta: cell.priceBarsDelta,
          evaluatedCount: cell.host?.evaluatedCount,
          attemptedCount: d.attemptedCount ?? cell.host?.rawFrameCount,
          paintedCount: d.paintedCount ?? null,
          matchedCount: d.matchedCount ?? cell.host?.evaluatedCount,
          oracleCoverage: d.oracleCoverage ?? cell.host?.oracleCoverage,
          densityOk: ev.densityOk,
          densityClass: cell.host?.densityClass || ev.densityClass,
          paintedRed: ev.paintedRed,
          paintedPassFailEligible: ev.densityOk === true,
          paintedSignal: ev.densityOk
            ? (ev.paintedRed ? 'PAINTED-FAIL-PRELIMINARY' : 'PAINTED-PASS-PRELIMINARY')
            : 'PAINTED-INELIGIBLE-DENSITY-SHORT',
          maxPrimaryAbsYPx: maxY,
          maxTemaAbsYPx: cell.host?.maxTemaAbsYPx,
          staleRatio: cell.host?.staleRatio,
          maxConsecStaleBusy: cell.host?.maxConsecStaleBusy,
          rejectReasons: d.rejectReasons || {},
          intervalMs: d.intervalMs || null,
          effectiveSampleHz: d.effectiveSampleHz ?? null,
          phaseSplit: cell.host?.phaseSplit || null,
          tipAssignmentAmbiguity: cell.host?.tipAssignmentAmbiguity || null,
          endpointAttribution: attribution,
          perIndicator: cell.host?.perIndicator || null,
          captureDiagnostics: d,
          asserts: {
            hostEvaluatedSamples: ev.asserts?.hostEvaluatedSamples,
            hostOracleCoverage: ev.asserts?.hostOracleCoverage,
            hostPrimaryYPx: ev.asserts?.hostPrimaryYPx,
            hostValueStaleRatio: ev.asserts?.hostValueStaleRatio,
          },
        };
      };

      const runBoundedSpeed = async (speed) => {
        const attempts = [];
        let densityOkCount = 0;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          const cell = await runCell(page, {
            speed,
            playMs: PLAY_FIXED,
            label: `${speed}x-bounded-${i + 1}`,
          });
          if (!cell?.ok) throw new Error(cell?.reason || `${speed}x attempt ${i + 1} failed`);
          const packed = packageAttempt(cell, i + 1, speed);
          attempts.push(packed);
          if (packed.densityOk) densityOkCount += 1;
          process.stderr.write(
            `[bounded] ${packed.label} densOk=${packed.densityOk} class=${packed.densityClass?.class} `
            + `eval=${packed.evaluatedCount} maxY=${Number(packed.maxPrimaryAbsYPx).toFixed(3)} `
            + `attr=${packed.endpointAttribution?.class} painted=${packed.paintedSignal}\n`,
          );
          if (densityOkCount >= TARGET_DENSITY_OK) break;
        }
        const densityOkAttempts = attempts.filter((a) => a.densityOk);
        const densityShortAttempts = attempts.filter((a) => !a.densityOk);
        const paintedFailOk = densityOkAttempts.filter((a) => a.paintedRed).length;
        const paintedPassOk = densityOkAttempts.filter((a) => !a.paintedRed).length;
        const attrCounts = {};
        for (const a of attempts) {
          const c = a.endpointAttribution?.class || 'UNKNOWN';
          attrCounts[c] = (attrCounts[c] || 0) + 1;
        }
        const densClassCounts = {};
        for (const a of attempts) {
          const c = a.densityClass?.class || 'UNKNOWN';
          densClassCounts[c] = (densClassCounts[c] || 0) + 1;
        }
        return {
          speed,
          playMs: PLAY_FIXED,
          maxAttempts: MAX_ATTEMPTS,
          targetDensityOk: TARGET_DENSITY_OK,
          attemptsRecorded: attempts.length,
          stoppedReason: densityOkCount >= TARGET_DENSITY_OK
            ? `REACHED_${TARGET_DENSITY_OK}_DENSITY_OK`
            : `MAX_ATTEMPTS_${MAX_ATTEMPTS}`,
          densityOkCount,
          densityShortCount: densityShortAttempts.length,
          paintedFailAmongDensityOk: paintedFailOk,
          paintedPassAmongDensityOk: paintedPassOk,
          densityClassCounts: densClassCounts,
          endpointAttributionCounts: attrCounts,
          maxPrimaryAbsYPx: stats(attempts.map((a) => a.maxPrimaryAbsYPx).filter((v) => v != null)),
          staleRatio: stats(attempts.map((a) => a.staleRatio).filter((v) => v != null)),
          evaluated: stats(attempts.map((a) => a.evaluatedCount || 0)),
          attempted: stats(attempts.map((a) => a.attemptedCount || 0)),
          // Full ordered attempt log — no omissions.
          attempts,
        };
      };

      process.stderr.write(
        `[bounded] PREDECLARED protocol: speeds=${SPEEDS.join(',')} playMs=${PLAY_FIXED} `
        + `maxAttempts=${MAX_ATTEMPTS} targetDensityOk=${TARGET_DENSITY_OK} `
        + `primary=${PRIMARY_TYPE} build=${EXPECTED_BUILD_ID} (${STATUS_MARK})\n`,
      );

      // Staged order: 15× first (control stability), then 60×, then 100×.
      const series15 = await runBoundedSpeed(15);
      const series60 = await runBoundedSpeed(60);
      const series100 = await runBoundedSpeed(100);

      const densityOk15 = series15.attempts.filter((a) => a.densityOk);
      const attr15 = {};
      for (const a of series15.attempts) {
        const c = a.endpointAttribution?.class || 'UNKNOWN';
        attr15[c] = (attr15[c] || 0) + 1;
      }
      const lateMaxes15 = densityOk15
        .map((a) => a.phaseSplit?.late?.maxAbsYPx)
        .filter((v) => v != null);
      const earlyMaxes15 = densityOk15
        .map((a) => a.phaseSplit?.early?.maxAbsYPx)
        .filter((v) => v != null);

      let controlStabilityClass = 'INCONCLUSIVE-PRELIMINARY';
      const warmupDom = series15.attempts.filter((a) => (
        a.endpointAttribution?.class === 'STARTUP-WARMUP-DOMINANT'
      )).length;
      const actualPaint = series15.attempts.filter((a) => (
        a.endpointAttribution?.class === 'ACTUAL-PAINTED-BEHAVIOR-PRELIMINARY'
      )).length;
      const tipAmb = series15.attempts.filter((a) => (
        a.endpointAttribution?.class === 'TIP-ASSIGNMENT-AMBIGUITY'
      )).length;
      const clean15 = series15.attempts.filter((a) => (
        a.endpointAttribution?.class === 'CONTROL-CLEAN-VS-PRIOR'
        || a.endpointAttribution?.class === 'ENDPOINT-WITHIN-GATES'
      )).length;
      const starve15 = series15.attempts.filter((a) => (
        String(a.endpointAttribution?.class || '').includes('STARVATION')
        || String(a.endpointAttribution?.class || '').includes('DENSITY-SHORT')
      )).length;

      if (series15.densityOkCount >= TARGET_DENSITY_OK && clean15 >= TARGET_DENSITY_OK) {
        controlStabilityClass = '15X-CONTROL-STABLE-CLEAN-PRELIMINARY';
      } else if (warmupDom >= actualPaint && warmupDom >= 1 && actualPaint === 0) {
        controlStabilityClass = '15X-ELEVATION-STARTUP-WARMUP-DOMINANT';
      } else if (actualPaint >= 2 && series15.densityOkCount >= TARGET_DENSITY_OK) {
        controlStabilityClass = '15X-ELEVATION-ACTUAL-PAINTED-PRELIMINARY';
      } else if (tipAmb >= 2) {
        controlStabilityClass = '15X-ELEVATION-TIP-ASSIGNMENT-AMBIGUITY';
      } else if (starve15 > 0 && series15.densityOkCount < TARGET_DENSITY_OK) {
        controlStabilityClass = '15X-DENSITY-SHORT-DOMINANT';
      } else if (series15.densityOkCount >= TARGET_DENSITY_OK && actualPaint >= 1) {
        controlStabilityClass = '15X-ELEVATION-MIXED-PAINTED-AND-OTHER';
      } else {
        controlStabilityClass = '15X-CONTROL-STABILITY-INCONCLUSIVE';
      }

      const result = {
        ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-BOUNDED-MATRIX',
        status: STATUS_MARK,
        phase: 'PREPARATION-BOUNDED-MATRIX',
        noGreenClaim: true,
        noAcceptedRedClaim: true,
        noProductEdits: true,
        noArtificialDwellInflation: true,
        noCherryPicking: true,
        predeclaredProtocol: {
          buildId: EXPECTED_BUILD_ID,
          primaryType: PRIMARY_TYPE,
          primaryTypeSource: PRIMARY_TYPE_SOURCE,
          speeds: SPEEDS,
          playMs: PLAY_FIXED,
          maxAttemptsPerSpeed: MAX_ATTEMPTS,
          stopAfterDensityOk: TARGET_DENSITY_OK,
          minEvaluated: MIN_EVALUATED,
          minOracleCoverage: MIN_ORACLE_COVERAGE,
          maxYPx: MAX_Y_PX,
          maxStaleRatio: MAX_STALE_RATIO,
          maxConsecStaleBusy: MAX_CONSEC_STALE_BUSY,
          recordEveryAttemptInOrder: true,
          stagedOrder: '15x → 60x → 100x',
        },
        priorClean15xBaseline: PRIOR_15X_CLEAN_BASELINE,
        buildPin,
        predocFlags: PREDOC_EVIDENCE,
        authEscalation,
        hostSetup: { ok: hostSetup.ok, buildId: hostSetup.buildId },
        panelsReady,
        series15x: series15,
        series60x: series60,
        series100x: series100,
        controlStability: {
          class: controlStabilityClass,
          attributionCounts: attr15,
          densityOkCount: series15.densityOkCount,
          densityShortCount: series15.densityShortCount,
          paintedFailAmongDensityOk: series15.paintedFailAmongDensityOk,
          paintedPassAmongDensityOk: series15.paintedPassAmongDensityOk,
          earlyMaxAbsYPx: stats(earlyMaxes15),
          lateMaxAbsYPx: stats(lateMaxes15),
          vsPriorClean: {
            priorMaxY: PRIOR_15X_CLEAN_BASELINE.maxTemaAbsYPx,
            priorStale: PRIOR_15X_CLEAN_BASELINE.staleRatio,
            priorPlayMs: PRIOR_15X_CLEAN_BASELINE.playMs,
            note: 'Prior baseline used playMs=24000; this matrix uses fixed 20000 — dwell not inflated; comparison notes playMs delta.',
          },
        },
        counts: {
          x15: {
            attempts: series15.attemptsRecorded,
            densityOk: series15.densityOkCount,
            densityShort: series15.densityShortCount,
            paintedFailAmongDensityOk: series15.paintedFailAmongDensityOk,
            paintedPassAmongDensityOk: series15.paintedPassAmongDensityOk,
            stoppedReason: series15.stoppedReason,
          },
          x60: {
            attempts: series60.attemptsRecorded,
            densityOk: series60.densityOkCount,
            densityShort: series60.densityShortCount,
            paintedFailAmongDensityOk: series60.paintedFailAmongDensityOk,
            paintedPassAmongDensityOk: series60.paintedPassAmongDensityOk,
            stoppedReason: series60.stoppedReason,
          },
          x100: {
            attempts: series100.attemptsRecorded,
            densityOk: series100.densityOkCount,
            densityShort: series100.densityShortCount,
            paintedFailAmongDensityOk: series100.paintedFailAmongDensityOk,
            paintedPassAmongDensityOk: series100.paintedPassAmongDensityOk,
            stoppedReason: series100.stoppedReason,
          },
        },
        verdict: 'M21-VY-BOUNDED-MATRIX-COMPLETE-PRELIMINARY',
        pass: false,
        note: 'PRELIMINARY bounded matrix only — every attempt recorded; density-short classified '
          + 'separately from painted pass/fail; no accepted RED/GREEN. PENDING-GPT56/AUTH.',
        nextQueue: 'authenticated TEMA measurement 1a as soon as env available',
        signature: 'W5 — PRELIMINARY-PENDING-GPT56/AUTH',
      };

      const outPath = process.env.M21_VY_OUT
        ? path.resolve(process.env.M21_VY_OUT)
        : path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-BOUNDED-MATRIX-b61.PRELIMINARY.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = (!buildOk || !panelsReady) ? 2 : 0;
    } else if (DENSITY_DIAG) {
      // Fixed wall clocks only — no artificial dwell inflation. Classify density shorts.
      const CTRL_SPEED = Math.max(1, Number(process.env.M21_VY_CTRL_SPEED) || 15);
      const REPEATS_60 = Math.max(5, Number(process.env.M21_VY_DENSITY_REPEATS_60) || 5);
      const REPEATS_CTRL = Math.max(2, Number(process.env.M21_VY_DENSITY_REPEATS_CTRL) || 2);
      const REPEATS_100 = Math.max(2, Number(process.env.M21_VY_DENSITY_REPEATS_100) || 2);
      const PLAY_FIXED = Math.max(4_000, Number(process.env.M21_VY_PLAY_MS_FIXED) || 20_000);

      const runSeries = async (speed, n, labelPrefix) => {
        const out = [];
        for (let i = 0; i < n; i++) {
          const cell = await runCell(page, {
            speed,
            playMs: PLAY_FIXED,
            label: `${labelPrefix}${i + 1}`,
          });
          if (!cell?.ok) throw new Error(cell?.reason || `${labelPrefix}${i + 1} failed`);
          const ev = evaluateCell(cell);
          const d = cell.host?.captureDiagnostics || {};
          out.push({
            label: cell.label,
            speed,
            playMs: PLAY_FIXED,
            indexDelta: cell.indexDelta,
            evaluatedCount: cell.host?.evaluatedCount,
            paintedRed: ev.paintedRed,
            densityOk: ev.densityOk,
            densityClass: cell.host?.densityClass || ev.densityClass,
            maxPrimaryAbsYPx: cell.host?.maxPrimaryAbsYPx ?? cell.host?.maxTemaAbsYPx,
            maxTemaAbsYPx: cell.host?.maxTemaAbsYPx,
            staleRatio: cell.host?.staleRatio,
            captureDiagnostics: d,
            rejectReasons: d.rejectReasons || {},
            intervalMs: d.intervalMs || null,
            effectiveSampleHz: d.effectiveSampleHz ?? null,
            perIndicatorPrimary: cell.host?.perIndicator?.[PRIMARY_TYPE] || null,
          });
        }
        return out;
      };

      const ctrlRuns = await runSeries(CTRL_SPEED, REPEATS_CTRL, `${CTRL_SPEED}x-ctrl`);
      const runs60 = await runSeries(60, REPEATS_60, '60x-dens');
      const runs100 = await runSeries(100, REPEATS_100, '100x-dens');

      const classCounts = (runs) => {
        const m = {};
        for (const r of runs) {
          const c = r.densityClass?.class || 'UNKNOWN';
          m[c] = (m[c] || 0) + 1;
        }
        return m;
      };
      const evalStats = (runs) => stats(runs.map((r) => r.evaluatedCount || 0));
      const attemptStats = (runs) => stats(runs.map((r) => r.captureDiagnostics?.attemptedCount || 0));
      const covStats = (runs) => stats(runs.map((r) => r.captureDiagnostics?.oracleCoverage || 0));

      const jitter60 = runs60.filter((r) => (
        String(r.densityClass?.class || '').includes('SCHEDULING')
        || String(r.densityClass?.class || '').includes('JITTER')
      ));
      const matchFail60 = runs60.filter((r) => (
        String(r.densityClass?.class || '').includes('ORACLE-MATCH')
        || String(r.densityClass?.class || '').includes('PAINTED-STROKE')
      ));
      const densityOk60 = runs60.filter((r) => r.densityOk).length;
      const paintedRed60DensityOk = runs60.filter((r) => r.densityOk && r.paintedRed).length;

      let rootCauseClass = 'INCONCLUSIVE-PRELIMINARY';
      if (jitter60.length > 0 && matchFail60.length === 0 && densityOk60 >= 1) {
        rootCauseClass = 'PROBE-SCHEDULING-CAPTURE-JITTER-DOMINANT';
      } else if (matchFail60.length > jitter60.length) {
        rootCauseClass = 'ORACLE-OR-PAINT-PATH-DOMINANT';
      } else if (densityOk60 === runs60.length) {
        rootCauseClass = 'NO-DENSITY-SHORT-OBSERVED';
      } else if (jitter60.length > 0) {
        rootCauseClass = 'PROBE-SCHEDULING-CAPTURE-JITTER-PRESENT';
      }

      const fixedCaptureProtocol = {
        status: STATUS_MARK,
        note: 'Proposed fixed wall-clock capture — gates unchanged; no mid-run dwell inflation.',
        primaryType: PRIMARY_TYPE,
        primaryTypeSource: PRIMARY_TYPE_SOURCE,
        gatesUnchanged: {
          minEvaluated: MIN_EVALUATED,
          minOracleCoverage: MIN_ORACLE_COVERAGE,
          maxYPx: MAX_Y_PX,
          maxStaleRatio: MAX_STALE_RATIO,
        },
        wallClockPlayMs: {
          '15x': PLAY_FIXED,
          '60x': PLAY_FIXED,
          '100x': PLAY_FIXED,
        },
        sampling: 'requestAnimationFrame + chart.render hook (dual); classify density via captureDiagnostics',
        acceptanceRuleForFuturePO: 'Cell densityOk requires evaluated≥60 AND coverage≥0.5 under fixed playMs. '
          + 'Density shorts classified PROBE-SCHEDULING-* are incomplete for acceptance — not painted-endpoint GREEN/RED. '
          + 'Require ≥3 densityOk repeats at target speed before any acceptance language.',
        poOverride: 'M21_VY_PRIMARY_TYPE=sma|ema|wma|dema|tema (default tema provisional)',
      };

      const result = {
        ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-DENSITY-DIAG',
        status: STATUS_MARK,
        phase: 'PREPARATION-DENSITY-DIAG',
        noGreenClaim: true,
        noAcceptedRedClaim: true,
        noProductEdits: true,
        noArtificialDwellInflation: true,
        primaryType: PRIMARY_TYPE,
        primaryTypeSource: PRIMARY_TYPE_SOURCE,
        buildPin,
        predocFlags: PREDOC_EVIDENCE,
        authEscalation,
        hostSetup,
        panelSetups,
        panelsReady,
        playMsFixed: PLAY_FIXED,
        controlRuns: ctrlRuns,
        runs60x: runs60,
        runs100x: runs100,
        summary: {
          control: {
            classCounts: classCounts(ctrlRuns),
            evaluated: evalStats(ctrlRuns),
            attempted: attemptStats(ctrlRuns),
            coverage: covStats(ctrlRuns),
          },
          x60: {
            classCounts: classCounts(runs60),
            evaluated: evalStats(runs60),
            attempted: attemptStats(runs60),
            coverage: covStats(runs60),
            densityOkCount: densityOk60,
            paintedRedAmongDensityOk: paintedRed60DensityOk,
            schedulingJitterCount: jitter60.length,
            matchFailCount: matchFail60.length,
          },
          x100: {
            classCounts: classCounts(runs100),
            evaluated: evalStats(runs100),
            attempted: attemptStats(runs100),
            coverage: covStats(runs100),
          },
        },
        rootCauseClass,
        fixedCaptureProtocol,
        verdict: 'M21-VY-DENSITY-DIAG-COMPLETE-PRELIMINARY',
        pass: false,
        note: 'PRELIMINARY density classification only. Does not accept RED or claim GREEN. '
          + 'PENDING-GPT56/AUTH.',
        signature: 'W5 — PRELIMINARY-PENDING-GPT56/AUTH',
      };

      const outPath = process.env.M21_VY_OUT
        ? path.resolve(process.env.M21_VY_OUT)
        : path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-DENSITY-DIAG-b61.PRELIMINARY.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = (!buildOk || !panelsReady) ? 2 : 0;
    } else if (PREP_MATRIX) {
      const CTRL_SPEED = Math.max(1, Number(process.env.M21_VY_CTRL_SPEED) || 15);
      const REPEATS = Math.max(3, Number(process.env.M21_VY_MATRIX_REPEATS) || 3);
      const PLAY_CTRL = Math.max(4_000, Number(process.env.M21_VY_PLAY_MS_CTRL) || 20_000);
      const PLAY_60 = PLAY_MS_60X;
      const PLAY_100 = PLAY_MS_100X;

      const ctrl = await runCell(page, {
        speed: CTRL_SPEED,
        playMs: PLAY_CTRL,
        label: `${CTRL_SPEED}x-control`,
      });
      if (!ctrl?.ok) throw new Error(ctrl?.reason || '15x control failed');

      const runs60 = [];
      for (let i = 0; i < REPEATS; i++) {
        const cell = await runCell(page, {
          speed: 60,
          playMs: PLAY_60,
          label: `60x-run${i + 1}`,
        });
        if (!cell?.ok) throw new Error(cell?.reason || `60x run ${i + 1} failed`);
        runs60.push(cell);
      }
      const runs100 = [];
      for (let i = 0; i < REPEATS; i++) {
        const cell = await runCell(page, {
          speed: 100,
          playMs: PLAY_100,
          label: `100x-run${i + 1}`,
        });
        if (!cell?.ok) throw new Error(cell?.reason || `100x run ${i + 1} failed`);
        runs100.push(cell);
      }

      const summarizeRuns = (runs, speed) => {
        const evals = runs.map((r) => evaluateCell(r));
        const maxYs = runs.map((r) => r.host?.maxTemaAbsYPx ?? null).filter((v) => v != null);
        const staleRs = runs.map((r) => r.host?.staleRatio ?? null).filter((v) => v != null);
        const dens = runs.map((r) => r.host?.evaluatedCount ?? 0);
        const redFlags = evals.map((e) => e.paintedRed === true);
        const densOk = evals.map((e) => e.densityOk === true);
        const perIndAgg = {};
        for (const t of FIVE_TYPES) {
          const maxYsT = runs.map((r) => r.host?.perIndicator?.[t]?.maxAbsYPx ?? null)
            .filter((v) => v != null);
          const staleT = runs.map((r) => r.host?.perIndicator?.[t]?.staleRatio ?? null)
            .filter((v) => v != null);
          perIndAgg[t] = {
            maxAbsYPx: stats(maxYsT),
            staleRatio: stats(staleT),
            redAtDefaultRuns: runs.filter((r) => r.host?.perIndicator?.[t]?.redAtDefault).length,
          };
        }
        // Merge threshold sensitivity across runs (OR of wouldRed).
        const sensKeys = ['maxYPx_1', 'maxYPx_2.5', 'maxYPx_5', 'maxYPx_10', 'maxYPx_15'];
        const sens = {};
        for (const k of sensKeys) {
          const would = runs.map((r) => r.host?.thresholdSensitivity?.[k]?.wouldRed === true);
          const failRatios = runs.map((r) => r.host?.thresholdSensitivity?.[k]?.failRatio)
            .filter((v) => v != null);
          sens[k] = {
            wouldRedRunCount: would.filter(Boolean).length,
            failRatio: stats(failRatios),
          };
        }
        return {
          speed,
          repeats: runs.length,
          evaluatedCounts: dens,
          evaluatedStats: stats(dens),
          maxTemaAbsYPx: stats(maxYs),
          staleRatio: stats(staleRs),
          paintedRedRunCount: redFlags.filter(Boolean).length,
          densityOkRunCount: densOk.filter(Boolean).length,
          redSignalRepeatable: redFlags.filter(Boolean).length >= 3
            && densOk.filter(Boolean).length >= 3,
          perIndicator: perIndAgg,
          thresholdSensitivity: sens,
          runs: runs.map((r, i) => ({
            label: r.label,
            evaluatedCount: r.host?.evaluatedCount,
            maxPrimaryAbsYPx: r.host?.maxPrimaryAbsYPx ?? r.host?.maxTemaAbsYPx,
            maxTemaAbsYPx: r.host?.maxTemaAbsYPx,
            staleRatio: r.host?.staleRatio,
            paintedRed: evals[i].paintedRed,
            densityOk: evals[i].densityOk,
            densityClass: r.host?.densityClass || null,
            captureDiagnostics: r.host?.captureDiagnostics || null,
            perIndicator: r.host?.perIndicator,
            thresholdSensitivity: r.host?.thresholdSensitivity,
          })),
        };
      };

      const matrix60 = summarizeRuns(runs60, 60);
      const matrix100 = summarizeRuns(runs100, 100);
      const ctrlEval = evaluateCell(ctrl);

      const result = {
        ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-PREP-MATRIX',
        status: STATUS_MARK,
        phase: 'PREPARATION-MATRIX',
        noGreenClaim: true,
        noAcceptedRedClaim: true,
        noProductEdits: true,
        scenario: 'prep matrix: 15x control + ≥3×60 + ≥3×100 / five-MA VALUE/Y oracle',
        buildPin,
        predocFlags: PREDOC_EVIDENCE,
        authEscalation,
        hostSetup,
        panelSetups,
        embedCount,
        panelsReady,
        thresholds: {
          minEvaluatedSamples: MIN_EVALUATED,
          maxYPx: MAX_Y_PX,
          maxStaleRatio: MAX_STALE_RATIO,
        },
        control15x: {
          cell: {
            label: ctrl.label,
            evaluatedCount: ctrl.host?.evaluatedCount,
            maxTemaAbsYPx: ctrl.host?.maxTemaAbsYPx,
            staleRatio: ctrl.host?.staleRatio,
            perIndicator: ctrl.host?.perIndicator,
          },
          asserts: ctrlEval.asserts,
          paintedRed: ctrlEval.paintedRed,
          densityOk: ctrlEval.densityOk,
          note: '15x control — expect lower stale than 60/100 if high-speed VALUE/Y lag is real',
        },
        matrix60x: matrix60,
        matrix100x: matrix100,
        redSignalRepeatable60: matrix60.redSignalRepeatable,
        redSignalRepeatable100: matrix100.redSignalRepeatable,
        variance: {
          maxTemaAbsYPx_60: matrix60.maxTemaAbsYPx,
          staleRatio_60: matrix60.staleRatio,
          maxTemaAbsYPx_100: matrix100.maxTemaAbsYPx,
          staleRatio_100: matrix100.staleRatio,
          controlMaxTemaAbsYPx: ctrl.host?.maxTemaAbsYPx ?? null,
          controlStaleRatio: ctrl.host?.staleRatio ?? null,
        },
        verdict: 'M21-VY-PREP-MATRIX-COMPLETE-PRELIMINARY',
        pass: false,
        note: 'PRELIMINARY prep matrix only — does NOT accept RED or claim GREEN. '
          + 'GPT-5.6 independent verify still required.',
        signature: 'W5 emergency capacity fallback — PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY',
      };

      const outPath = process.env.M21_VY_OUT
        ? path.resolve(process.env.M21_VY_OUT)
        : path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-PREP-MATRIX-b61.PRELIMINARY.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = (!buildOk || !panelsReady) ? 2 : 0;
    } else {
      const primary = await runCell(page, {
        speed: PRIMARY_SPEED,
        playMs: PLAY_MS_60X,
        label: `${PRIMARY_SPEED}x-valueY`,
      });
      if (!primary?.ok) throw new Error(primary?.reason || '60x failed');

      const stress = await runCell(page, {
        speed: STRESS_SPEED,
        playMs: PLAY_MS_100X,
        label: `${STRESS_SPEED}x-valueY`,
      });
      if (!stress?.ok) throw new Error(stress?.reason || '100x failed');

      const primaryEval = evaluateCell(primary);
      const stressEval = evaluateCell(stress);
      const densityOk = primaryEval.densityOk && stressEval.densityOk;
      const paintedRed = primaryEval.paintedRed || stressEval.paintedRed;
      const g2Seen = primary.g2HostOnlyValueLag || stress.g2HostOnlyValueLag;

      let verdict;
      let exitCode;
      if (!buildOk) {
        verdict = 'M21-VY-SETUP-FAIL-BUILD';
        exitCode = 2;
      } else if (!panelsReady || embedCount < 3) {
        verdict = 'M21-VY-INCOMPLETE-PANELS';
        exitCode = 2;
      } else if (paintedRed && densityOk) {
        verdict = g2Seen ? 'M21-VY-RED-G2-HOST-ONLY' : 'M21-VY-RED';
        exitCode = 1;
      } else if (paintedRed && !densityOk) {
        verdict = 'M21-VY-RED-SIGNAL-DENSITY-SHORT';
        exitCode = 2;
      } else if (!densityOk) {
        verdict = 'M21-VY-INCOMPLETE-DENSITY-OR-ORACLE';
        exitCode = 2;
      } else {
        verdict = 'M21-VY-NO-VALUE-LAG-OBSERVED-INCOMPLETE';
        exitCode = 3;
      }

      const result = {
        ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y',
        status: STATUS_MARK,
        phase: 'PREPARATION-RED',
        noGreenClaim: true,
        noProductEdits: true,
        scenario: 'G2 4-panel HOST vs peers / five-MA / draw-call Y+value vs forming-OHLC expected',
        primaryType: PRIMARY_TYPE,
        buildPin,
        predocFlags: PREDOC_EVIDENCE,
        expectedBuildId: EXPECTED_BUILD_ID,
        expectedBuildSource: EXPECTED_BUILD_SOURCE,
        candidateBuildTarget: CANDIDATE_BUILD,
        buildId: hostSetup.buildId,
        deployedMode: DEPLOYED_MODE,
        assetOrigin: DEPLOYED_MODE ? DEPLOYED_ORIGIN : null,
        upstreamObservedBuild: upstreamVerify?.upstreamObservedBuild || null,
        provenanceNote: DEPLOYED_MODE
          ? `Product /chart/* from ${DEPLOYED_ORIGIN}; synthetic /api/* local. `
            + 'Value/Y oracle: Canvas2D stroke tip Y inverted + independent forming-OHLC MA tips.'
          : 'Local 4-panel value/Y oracle.',
        authEscalation,
        hostSetup,
        panelSetups,
        embedCount,
        panelsReady,
        thresholds: {
          minEvaluatedSamples: MIN_EVALUATED,
          maxYPx: MAX_Y_PX,
          maxValueAbs: MAX_VALUE_ABS,
          maxValueRel: MAX_VALUE_REL,
          maxStaleRatio: MAX_STALE_RATIO,
          maxConsecStaleBusy: MAX_CONSEC_STALE_BUSY,
          minOracleCoverage: MIN_ORACLE_COVERAGE,
          dataArrayOracleForbidden: true,
          pixelOccupancyAloneForbidden: true,
        },
        primarySpeed: PRIMARY_SPEED,
        stressSpeed: STRESS_SPEED,
        primaryCell: primary,
        stressCell: stress,
        asserts: {
          buildId: { pass: buildOk, value: hostSetup.buildId, expected: EXPECTED_BUILD_ID },
          panelsReady: { pass: panelsReady, embedCount },
          primary: primaryEval.asserts,
          stress: stressEval.asserts,
          g2HostOnlyValueLag: {
            pass: g2Seen,
            primary: primary.g2HostOnlyValueLag,
            stress: stress.g2HostOnlyValueLag,
          },
        },
        paintedRed,
        densityOk,
        g2HostOnlyValueLagSeen: g2Seen,
        verdict,
        pass: false,
        note: verdict.startsWith('M21-VY-RED') && densityOk
          ? 'Desired b61 negative baseline: painted VALUE/Y lag evidenced at ≥60 evaluated samples.'
          : `Non-accepting: ${verdict}. PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY.`,
        doesNotSupersede: 'Bar-index/pixel-occupancy M21-PE4 remains; neither authorizes b62 alone.',
        signature: 'W5 emergency capacity fallback — PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY',
      };

      const outPath = process.env.M21_VY_OUT ? path.resolve(process.env.M21_VY_OUT) : null;
      if (outPath) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      }
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = exitCode;
    }
  } finally {
    try { await boot?.close?.(); } catch (_) {}
    try { await browser.close(); } catch (_) {}
    try { await server.close(); } catch (_) {}
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 2;
});
