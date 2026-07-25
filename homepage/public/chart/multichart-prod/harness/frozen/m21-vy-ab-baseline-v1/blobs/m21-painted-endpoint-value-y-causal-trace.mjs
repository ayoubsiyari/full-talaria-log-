/**
 * M21 VALUE/Y — NO-PRODUCT-EDIT causal trace (exact b61).
 *
 * STATUS: PRELIMINARY-PENDING-GPT56/AUTH
 * Harness-only prototype wrappers + performance marks. Preserves app behavior.
 * No gate changes, no accepted RED/GREEN, no auth data, no commit/push/deploy.
 *
 * Correlates painted TEMA endpoint failures with indicator compute/worker/render
 * timing. Unavailable events are marked UNOBSERVED (never inferred).
 *
 * Usage:
 *   M19_EXPECTED_BUILD_ID=20260724b61 M19_DEPLOYED_ORIGIN=http://31.97.192.82:3000 \
 *     M21_VY_CAUSAL_OUT=docs/plan3/evidence/W5-M21-VY-CAUSAL-TRACE-b61.PRELIMINARY.json \
 *     node m21-painted-endpoint-value-y-causal-trace.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, normalizeDeployedOrigin } from './serve.mjs';
import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS = 'PRELIMINARY-PENDING-GPT56/AUTH';
const EXPECTED = String(process.env.M19_EXPECTED_BUILD_ID || '20260724b61').trim();
const DEPLOYED_ORIGIN = (() => {
  try { return normalizeDeployedOrigin(process.env.M19_DEPLOYED_ORIGIN); }
  catch (e) { throw new Error(`CAUSAL SETUP-FAIL: ${e?.message || e}`); }
})();
const PLAY_MS = 20_000;
const MAX_Y_PX = 2.5;
const MAX_STALE_RATIO = 0.08;
const MIN_EVALUATED = 60;
const PRIMARY = 'tema';
const FIVE_MA = [
  ['sma', { period: 20 }],
  ['ema', { period: 20 }],
  ['wma', { period: 20 }],
  ['dema', { period: 20 }],
  ['tema', { period: 20 }],
];
const START_OFFSET = 4_000;
const TRACE_CAP = 8_000;

function installPreDocument() {
  return {
    fn: () => {
      if (window.__m21ctInstalled) return;
      window.__m21ctInstalled = true;
      const TRACE_CAP_BROWSER = 8000;
      const events = [];
      const push = (type, fields = {}) => {
        try {
          if (events.length >= TRACE_CAP_BROWSER) events.shift();
          const ev = { t: performance.now(), type, ...fields };
          events.push(ev);
          try { performance.mark(`m21ct:${type}`); } catch (_e) { /* */ }
          return ev;
        } catch (_err) {
          try {
            events.push({
              t: performance.now(),
              type: 'push_error',
              message: String(_err?.message || _err),
            });
          } catch (__e) { /* */ }
          return null;
        }
      };
      window.__m21ct = {
        events,
        push,
        sampling: false,
        strokeTips: [],
        lastStrokeTips: [],
        captureDraws: false,
        lastOracle: null,
        coverage: {
          workerPostMessage: false,
          workerOnMessage: false,
          scheduleRecalc: false,
          recalcAsync: false,
          recalcIncremental: false,
          applyResults: false,
          scheduleRender: false,
          render: false,
          drawIndicators: false,
          replayTick: false,
          canvasStroke: false,
          oracleSample: false,
        },
      };

      // Observe Worker I/O without changing message contents.
      try {
        const origPost = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function m21ctPost(msg, transfer) {
          try {
            const sink = window.__m21ct;
            if (sink) {
              sink.coverage.workerPostMessage = true;
              const m = msg && typeof msg === 'object' ? msg : null;
              sink.push('worker_post', {
                msgType: m?.type || 'UNOBSERVED',
                msgId: m?.id ?? null,
                hasBarsPacked: !!(m?.payload?.barsPacked),
                indicatorKeys: m?.payload?.indicators
                  ? Object.keys(m.payload.indicators).length
                  : null,
              });
            }
          } catch (_e) { /* */ }
          return transfer !== undefined
            ? origPost.call(this, msg, transfer)
            : origPost.call(this, msg);
        };
      } catch (_e) { /* */ }

      try {
        const proto = Worker.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
        if (desc && desc.set && desc.get) {
          Object.defineProperty(proto, 'onmessage', {
            configurable: true,
            enumerable: desc.enumerable,
            get() { return desc.get.call(this); },
            set(fn) {
              const wrapped = function m21ctOnMsg(ev) {
                try {
                  const sink = window.__m21ct;
                  if (sink) {
                    sink.coverage.workerOnMessage = true;
                    const d = ev?.data;
                    sink.push('worker_message', {
                      msgType: d?.type || 'UNOBSERVED',
                      msgId: d?.id ?? null,
                      hasResults: !!(d?.results),
                      error: d?.type === 'ERROR' ? String(d.error || 'error') : null,
                    });
                  }
                } catch (_e) { /* */ }
                return typeof fn === 'function' ? fn.call(this, ev) : undefined;
              };
              return desc.set.call(this, wrapped);
            },
          });
        } else {
          window.__m21ct.push('observe_gap', {
            gap: 'Worker.onmessage setter UNOBSERVED — rely on _applyIndicatorWorkerResults wrap',
          });
        }
      } catch (_e) {
        window.__m21ct.push('observe_gap', { gap: 'Worker.onmessage wrap failed' });
      }

      // Canvas tip capture (same unit as VALUE/Y oracle).
      const cproto = CanvasRenderingContext2D.prototype;
      if (!cproto.__m21ctWrapped) {
        const origMoveTo = cproto.moveTo;
        const origLineTo = cproto.lineTo;
        const origStroke = cproto.stroke;
        let pathMaxX = -Infinity;
        let pathMaxY = null;
        let pathPoints = 0;
        cproto.moveTo = function (x, y, ...rest) {
          const sink = window.__m21ct;
          if (sink?.captureDraws) {
            const nx = Number(x);
            const ny = Number(y);
            if (Number.isFinite(nx) && Number.isFinite(ny) && nx >= pathMaxX) {
              pathMaxX = nx; pathMaxY = ny;
            }
            pathPoints += 1;
          }
          return origMoveTo.call(this, x, y, ...rest);
        };
        cproto.lineTo = function (x, y, ...rest) {
          const sink = window.__m21ct;
          if (sink?.captureDraws) {
            const nx = Number(x);
            const ny = Number(y);
            if (Number.isFinite(nx) && Number.isFinite(ny) && nx >= pathMaxX) {
              pathMaxX = nx; pathMaxY = ny;
            }
            pathPoints += 1;
          }
          return origLineTo.call(this, x, y, ...rest);
        };
        cproto.stroke = function (...args) {
          const sink = window.__m21ct;
          if (sink?.captureDraws && pathPoints > 0 && Number.isFinite(pathMaxX)) {
            sink.coverage.canvasStroke = true;
            sink.strokeTips.push({ x: pathMaxX, y: pathMaxY, points: pathPoints });
          }
          pathMaxX = -Infinity; pathMaxY = null; pathPoints = 0;
          return origStroke.apply(this, args);
        };
        cproto.__m21ctWrapped = true;
      }
    },
  };
}

const INSTALL_CHART_WRAPS = () => {
  const chart = window.chart;
  const replay = chart?.replaySystem;
  const sink = window.__m21ct;
  if (!chart || !sink) return { ok: false, reason: 'missing chart/sink' };
  // Must be literal inside evaluate() — outer Node consts are not closed over.
  const MAX_Y_PX_BROWSER = 2.5;

  const snapReplay = () => {
    const data = chart.data || [];
    const last = data.length ? data[data.length - 1] : null;
    const anim = replay?.animatingCandle;
    return {
      idx: replay?.currentIndex ?? null,
      bars: data.length,
      lastT: last?.t ?? null,
      lastC: last != null ? Number(last.c) : null,
      formingClose: anim ? Number(anim.close) : (last != null ? Number(last.c) : null),
      tickProgress: Number(replay?.tickProgress) || 0,
      playbackMode: replay?.playbackMode || null,
      speed: replay?.speed ?? null,
      dataVersion: chart.dataVersion ?? null,
      indRenderVersion: chart._indicatorRenderVersion ?? null,
      workerBusy: !!chart._indicatorWorkerBusy,
      workerCoalesce: !!chart._indicatorWorkerCoalesce,
      workerSeq: chart._indicatorWorkerSeq ?? null,
      sessionFp: chart._sessionIndReplayFp ?? null,
      sessionTipFp: chart._sessionIndReplayTipFp ?? null,
      pendingRecalcRaf: chart._replayIndRecalcRaf != null,
    };
  };

  if (typeof chart.scheduleReplayIndicatorRecalc === 'function'
    && !chart.scheduleReplayIndicatorRecalc.__m21ctWrapped) {
    const orig = chart.scheduleReplayIndicatorRecalc.bind(chart);
    chart.scheduleReplayIndicatorRecalc = function m21ctSched(isPlaying) {
      sink.coverage.scheduleRecalc = true;
      const before = snapReplay();
      const busyBefore = before.workerBusy;
      const coalesceBefore = before.workerCoalesce;
      const ret = orig(isPlaying);
      const after = snapReplay();
      sink.push('ind_schedule_recalc', {
        isPlaying: isPlaying ?? null,
        before,
        after,
        busyBefore,
        coalesceBefore,
        coalesceAfter: after.workerCoalesce,
        pendingRafAfter: after.pendingRecalcRaf,
        sameBarSkipLikely: !!(before.sessionFp && after.sessionFp && before.sessionFp === after.sessionFp
          && before.bars === after.bars && before.formingClose === after.formingClose),
      });
      return ret;
    };
    chart.scheduleReplayIndicatorRecalc.__m21ctWrapped = true;
  } else {
    sink.push('observe_gap', { gap: 'scheduleReplayIndicatorRecalc UNOBSERVED' });
  }

  if (typeof chart.recalculateIndicatorsAsync === 'function'
    && !chart.recalculateIndicatorsAsync.__m21ctWrapped) {
    const orig = chart.recalculateIndicatorsAsync.bind(chart);
    chart.recalculateIndicatorsAsync = function m21ctAsync(...args) {
      sink.coverage.recalcAsync = true;
      const before = snapReplay();
      if (before.workerBusy) {
        sink.push('ind_async_coalesce_enqueue', {
          reason: 'worker_busy_coalesce_flag',
          before,
        });
      } else {
        sink.push('ind_async_request', { before, seqWillBump: true });
      }
      return orig(...args);
    };
    chart.recalculateIndicatorsAsync.__m21ctWrapped = true;
  } else {
    sink.push('observe_gap', { gap: 'recalculateIndicatorsAsync UNOBSERVED' });
  }

  if (typeof chart.recalculateIndicatorsIncremental === 'function'
    && !chart.recalculateIndicatorsIncremental.__m21ctWrapped) {
    const orig = chart.recalculateIndicatorsIncremental.bind(chart);
    chart.recalculateIndicatorsIncremental = function m21ctIncr(...args) {
      sink.coverage.recalcIncremental = true;
      sink.push('ind_incremental', {
        fromBar: args[0] ?? null,
        snap: snapReplay(),
      });
      return orig(...args);
    };
    chart.recalculateIndicatorsIncremental.__m21ctWrapped = true;
  } else {
    sink.push('observe_gap', { gap: 'recalculateIndicatorsIncremental UNOBSERVED' });
  }

  if (typeof chart._applyIndicatorWorkerResults === 'function'
    && !chart._applyIndicatorWorkerResults.__m21ctWrapped) {
    const orig = chart._applyIndicatorWorkerResults.bind(chart);
    chart._applyIndicatorWorkerResults = function m21ctApply(results, mySeq, calcToken, tailMeta) {
      sink.coverage.applyResults = true;
      const seqNow = chart._indicatorWorkerSeq;
      const seqMatch = seqNow === mySeq;
      const before = snapReplay();
      let applied = false;
      let dropReason = null;
      if (!seqMatch) dropReason = 'seq_mismatch_stale';
      const ret = orig(results, mySeq, calcToken, tailMeta);
      const after = snapReplay();
      // Heuristic: if render version / data unchanged and seq mismatched → dropped.
      if (!seqMatch) {
        applied = false;
      } else if (after.indRenderVersion !== before.indRenderVersion
        || after.workerBusy !== before.workerBusy) {
        applied = true;
      } else if (tailMeta) {
        applied = 'UNOBSERVED_TAIL_APPLY_SIDE_EFFECT';
      } else {
        applied = 'UNOBSERVED_APPLY_SIDE_EFFECT';
      }
      sink.push('ind_apply_results', {
        mySeq,
        seqNow,
        seqMatch,
        hasTailMeta: !!tailMeta,
        tailTotalLength: tailMeta?.totalLength ?? null,
        resultKeys: results && typeof results === 'object' ? Object.keys(results).length : 0,
        dropReason,
        applied,
        before,
        after,
      });
      return ret;
    };
    chart._applyIndicatorWorkerResults.__m21ctWrapped = true;
  } else {
    sink.push('observe_gap', { gap: '_applyIndicatorWorkerResults UNOBSERVED' });
  }

  if (typeof chart.scheduleRender === 'function' && !chart.scheduleRender.__m21ctWrapped) {
    const orig = chart.scheduleRender.bind(chart);
    chart.scheduleRender = function m21ctSchedRender(...args) {
      sink.coverage.scheduleRender = true;
      sink.push('render_schedule', { snap: snapReplay() });
      return orig(...args);
    };
    chart.scheduleRender.__m21ctWrapped = true;
  } else {
    sink.push('observe_gap', { gap: 'scheduleRender UNOBSERVED' });
  }

  if (typeof chart.render === 'function' && !chart.render.__m21ctWrapped) {
    const orig = chart.render.bind(chart);
    chart.render = function m21ctRender(...args) {
      sink.coverage.render = true;
      const ret = orig(...args);
      sink.push('render_paint', {
        snap: snapReplay(),
        strokeTipCount: Array.isArray(sink.lastStrokeTips) ? sink.lastStrokeTips.length : 0,
      });
      // Oracle after paint so stroke tips from drawIndicators* are available.
      try {
        if (sink.sampling && typeof sink.sampleOracle === 'function') sink.sampleOracle();
      } catch (_e) { /* */ }
      return ret;
    };
    chart.render.__m21ctWrapped = true;
  }

  const wrapDraw = (name) => {
    if (typeof chart[name] !== 'function' || chart[name].__m21ctWrapped) return;
    const orig = chart[name].bind(chart);
    chart[name] = function m21ctDraw(...args) {
      sink.coverage.drawIndicators = true;
      sink.captureDraws = true;
      sink.strokeTips = [];
      try {
        return orig(...args);
      } finally {
        sink.captureDraws = false;
        sink.lastStrokeTips = sink.strokeTips.slice();
        sink.push('draw_indicators', {
          fn: name,
          strokeTipCount: sink.lastStrokeTips.length,
          snap: snapReplay(),
        });
      }
    };
    chart[name].__m21ctWrapped = true;
  };
  wrapDraw('drawIndicators');
  wrapDraw('drawIndicatorsOptimized');

  if (replay && typeof replay.updateChartWithAnimatedCandle === 'function'
    && !replay.updateChartWithAnimatedCandle.__m21ctWrapped) {
    const orig = replay.updateChartWithAnimatedCandle.bind(replay);
    replay.updateChartWithAnimatedCandle = function m21ctAnim(...args) {
      sink.coverage.replayTick = true;
      const ret = orig(...args);
      sink.push('replay_tick_anim', { snap: snapReplay() });
      return ret;
    };
    replay.updateChartWithAnimatedCandle.__m21ctWrapped = true;
  }

  // Five-MA expected tips + sortY pairing (same unit as acceptance VALUE/Y probe).
  const computeExpectedTips = (bars, formingClose, period = 20) => {
    const n = bars.length;
    if (n < period) return null;
    const closes = new Array(n);
    for (let i = 0; i < n; i++) {
      let c = Number(bars[i]?.c);
      if (i === n - 1 && Number.isFinite(formingClose)) c = formingClose;
      closes[i] = Number.isFinite(c) ? c : null;
    }
    const sma = new Array(n).fill(null);
    let sum = 0; let valid = 0;
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
      let prev = null; let seedSum = 0; let seedCount = 0;
      for (let i = 0; i < n; i++) {
        const v = src[i];
        if (v == null || !Number.isFinite(v)) continue;
        if (prev == null) {
          seedSum += v; seedCount += 1;
          if (seedCount === period) { prev = seedSum / period; out[i] = prev; }
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
      let wsum = 0; let ok = true;
      for (let j = 0; j < period; j++) {
        const v = closes[i - j];
        if (v == null) { ok = false; break; }
        wsum += v * (period - j);
      }
      if (ok) wma[i] = wsum / denom;
    }
    const pseudo = (series) => series.map((v, i) => (v != null && Number.isFinite(v) ? v : closes[i]));
    const ema2 = emaSeries(pseudo(ema1));
    const dema = ema1.map((a, i) => (a == null || ema2[i] == null ? null : 2 * a - ema2[i]));
    const ema3 = emaSeries(pseudo(ema2));
    const tema = ema1.map((a, i) => {
      const b = ema2[i]; const c = ema3[i];
      if (a == null || b == null || c == null) return null;
      return 3 * a - 3 * b + c;
    });
    const tipOf = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
      }
      return null;
    };
    return { sma: tipOf(sma), ema: tipOf(ema1), wma: tipOf(wma), dema: tipOf(dema), tema: tipOf(tema) };
  };

  sink.sampleOracle = () => {
    sink.coverage.oracleSample = true;
    const snap = snapReplay();
    const strokes = Array.isArray(sink.lastStrokeTips) ? sink.lastStrokeTips.slice() : [];
    const tips = computeExpectedTips(chart.data || [], snap.formingClose, 20);
    let priceX = null;
    try { priceX = Number(chart.dataIndexToPixel((chart.data?.length || 1) - 1)); } catch (_e) { /* */ }
    const candleW = Math.max(2, Number(chart.candleWidth) || 6);
    const near = strokes.filter((s) => (
      Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(priceX)
      && Math.abs(s.x - priceX) <= candleW * 2.5
    )).sort((a, b) => a.y - b.y);
    const expectedList = [];
    if (tips) {
      for (const t of ['sma', 'ema', 'wma', 'dema', 'tema']) {
        const val = tips[t];
        if (val == null) continue;
        let expY = null;
        try { expY = Number(chart.yScale(val)); } catch (_e) { /* */ }
        if (Number.isFinite(expY)) expectedList.push({ t, val, expY });
      }
    }
    expectedList.sort((a, b) => a.expY - b.expY);
    const pairN = Math.min(near.length, expectedList.length);
    let temaDrawnY = null;
    let temaExpectedY = null;
    let temaExpectedVal = null;
    for (let i = 0; i < expectedList.length; i++) {
      if (expectedList[i].t !== 'tema') continue;
      temaExpectedY = expectedList[i].expY;
      temaExpectedVal = expectedList[i].val;
      temaDrawnY = i < pairN ? near[i].y : null;
    }
    const absYPx = (temaDrawnY != null && temaExpectedY != null)
      ? Math.abs(temaDrawnY - temaExpectedY) : null;
    let drawnVal = null;
    if (temaDrawnY != null && chart.yScale?.invert) {
      try { drawnVal = Number(chart.yScale.invert(temaDrawnY)); } catch (_e) { /* */ }
    }
    const valueStale = absYPx != null && absYPx > MAX_Y_PX_BROWSER;
    const matched = Math.min(near.length, expectedList.length);
    const oracleOk = matched >= 3 && temaDrawnY != null;
    const classification = !oracleOk
      ? (strokes.length === 0 ? 'NO_STROKE' : 'ORACLE_INCOMPLETE')
      : (valueStale ? 'PAINTED_FAIL' : 'PAINTED_PASS');
    const sample = {
      snap,
      strokeCount: strokes.length,
      tipColumnCount: near.length,
      expectedVal: temaExpectedVal,
      expectedY: temaExpectedY,
      drawnY: temaDrawnY,
      drawnVal,
      absYPx,
      valueStale,
      oracleOk,
      classification,
      pairMethod: 'sortY-fiveMA',
      pairMethodNote: 'Same pairing family as acceptance VALUE/Y probe',
    };
    sink.lastOracle = sample;
    sink.push('oracle_sample', sample);
    return sample;
  };

  return { ok: true, buildHint: typeof CHART_ENGINE_BUILD === 'string' ? CHART_ENGINE_BUILD : null };
};

function classifyFailWindow(events, failEv) {
  const tFail = failEv.t;
  const windowStart = tFail - 2_500;
  const win = events.filter((e) => e.t >= windowStart && e.t <= tFail + 16);
  const types = new Set(win.map((e) => e.type));
  const snap = failEv.snap || failEv;
  const busy = !!(snap.workerBusy ?? snap.snap?.workerBusy);
  const coalesce = !!(snap.workerCoalesce ?? snap.snap?.workerCoalesce);
  const pendingRaf = !!(snap.pendingRecalcRaf ?? snap.snap?.pendingRecalcRaf);

  const hasSchedule = types.has('ind_schedule_recalc');
  const hasAsyncReq = types.has('ind_async_request') || types.has('ind_incremental');
  const hasCoalesce = types.has('ind_async_coalesce_enqueue');
  const hasApply = types.has('ind_apply_results');
  const hasApplyDrop = win.some((e) => e.type === 'ind_apply_results' && e.dropReason);
  const hasApplyOk = win.some((e) => e.type === 'ind_apply_results' && e.seqMatch === true);
  const hasRenderSched = types.has('render_schedule');
  const hasRender = types.has('render_paint') || types.has('draw_indicators');
  const sameBarSkip = win.some((e) => e.type === 'ind_schedule_recalc' && e.sameBarSkipLikely);

  // Oldest demonstrable boundary (ordered).
  if (failEv.classification === 'NO_STROKE' && !hasRender) {
    return {
      boundary: 'SCHEDULING_STARVATION',
      confidence: 'MEDIUM',
      evidence: ['no stroke tips', hasRender ? 'render seen' : 'render absent in window'],
      observedInWindow: [...types],
    };
  }
  if (sameBarSkip && busy) {
    return {
      boundary: 'COMPUTE_REQUEST_LATE_OR_SKIPPED',
      confidence: 'MEDIUM',
      evidence: ['sameBarSkipLikely while workerBusy in fail window'],
      observedInWindow: [...types],
    };
  }
  if (hasCoalesce || (busy && !hasApplyOk)) {
    return {
      boundary: 'RESULT_LATE_OR_BACKLOG',
      confidence: hasCoalesce ? 'HIGH' : 'MEDIUM',
      evidence: [
        hasCoalesce ? 'ind_async_coalesce_enqueue observed' : 'workerBusy without successful apply in window',
        coalesce ? 'coalesce flag true at sample' : null,
      ].filter(Boolean),
      observedInWindow: [...types],
    };
  }
  if (hasApplyDrop) {
    return {
      boundary: 'STALE_RESULT_DROPPED',
      confidence: 'HIGH',
      evidence: ['ind_apply_results dropReason present'],
      observedInWindow: [...types],
    };
  }
  if (hasApplyOk && !hasRender && pendingRaf) {
    return {
      boundary: 'DATA_CURRENT_RENDER_LATE',
      confidence: 'MEDIUM',
      evidence: ['apply seqMatch', 'no render/draw in window', 'pendingRecalcRaf'],
      observedInWindow: [...types],
    };
  }
  if (hasApplyOk && hasRender && failEv.valueStale) {
    return {
      boundary: 'RENDER_CURRENT_ENDPOINT_EXTRACTION_MISMATCH',
      confidence: 'MEDIUM',
      evidence: [
        'apply + render/draw in window',
        `absYPx=${failEv.absYPx}`,
        failEv.pairMethodNote || 'pairMethod diagnostic',
      ],
      observedInWindow: [...types],
    };
  }
  if (!hasSchedule && !hasAsyncReq && busy) {
    return {
      boundary: 'COMPUTE_REQUEST_LATE',
      confidence: 'LOW',
      evidence: ['no schedule/async in window', 'workerBusy at fail'],
      observedInWindow: [...types],
    };
  }
  if (hasRender && failEv.valueStale && !hasApply) {
    return {
      boundary: 'RESULT_LATE_OR_BACKLOG',
      confidence: 'LOW',
      evidence: ['render without apply in window; painted stale'],
      observedInWindow: [...types],
    };
  }
  return {
    boundary: 'UNOBSERVED_OR_AMBIGUOUS',
    confidence: 'LOW',
    evidence: ['insufficient ordered evidence for a single oldest boundary'],
    observedInWindow: [...types],
    unobserved: [
      !hasSchedule ? 'ind_schedule_recalc' : null,
      !hasAsyncReq ? 'ind_async_request|ind_incremental' : null,
      !hasApply ? 'ind_apply_results' : null,
      !hasRenderSched ? 'render_schedule' : null,
    ].filter(Boolean),
  };
}

function summarizeCell(raw) {
  const events = raw.events || [];
  const oracle = events.filter((e) => e.type === 'oracle_sample');
  const evaluated = oracle.filter((e) => e.oracleOk === true);
  const fails = evaluated.filter((e) => e.classification === 'PAINTED_FAIL');
  const passes = evaluated.filter((e) => e.classification === 'PAINTED_PASS');
  const densityOk = evaluated.length >= MIN_EVALUATED;
  const staleRatio = evaluated.length ? fails.length / evaluated.length : null;
  const maxAbsY = evaluated.reduce((m, e) => Math.max(m, e.absYPx || 0), 0);
  const paintedRed = densityOk && (maxAbsY > MAX_Y_PX || (staleRatio != null && staleRatio > MAX_STALE_RATIO));

  // Warmup vs late for mixed 15× attribution support.
  const t0 = oracle.length ? oracle[0].t : null;
  const lateFails = fails.filter((e) => t0 != null && e.t >= t0 + 3_000);
  const earlyFails = fails.filter((e) => t0 != null && e.t < t0 + 3_000);

  const failWindows = fails.slice(0, 12).map((f) => ({
    t: f.t,
    absYPx: f.absYPx,
    workerBusy: f.snap?.workerBusy ?? null,
    workerCoalesce: f.snap?.workerCoalesce ?? null,
    formingClose: f.snap?.formingClose ?? null,
    bars: f.snap?.bars ?? null,
    causal: classifyFailWindow(events, f),
  }));

  const typeCounts = {};
  for (const e of events) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;

  let caseTag = 'UNCLASSIFIED';
  if (!densityOk) caseTag = 'DENSITY_SHORT';
  else if (!paintedRed && maxAbsY <= MAX_Y_PX) caseTag = 'CLEAN_DENSITY_OK';
  else if (paintedRed && lateFails.length && earlyFails.length === 0) caseTag = 'PAINTED_FAIL_STEADY';
  else if (paintedRed && earlyFails.length && lateFails.length === 0) caseTag = 'PAINTED_FAIL_WARMUP';
  else if (paintedRed) caseTag = 'PAINTED_FAIL_MIXED';

  const boundaryCounts = {};
  for (const w of failWindows) {
    const b = w.causal?.boundary || 'UNKNOWN';
    boundaryCounts[b] = (boundaryCounts[b] || 0) + 1;
  }

  return {
    label: raw.label,
    speed: raw.speed,
    playMs: raw.playMs,
    caseTag,
    densityOk,
    paintedRedPreliminary: paintedRed,
    evaluatedCount: evaluated.length,
    oracleSampleCount: oracle.length,
    failCount: fails.length,
    passCount: passes.length,
    maxAbsYPx: maxAbsY,
    staleRatio,
    earlyFailCount: earlyFails.length,
    lateFailCount: lateFails.length,
    eventTypeCounts: typeCounts,
    observeCoverage: raw.coverage || {},
    failWindows,
    boundaryCounts,
    chronologicBlindSample: events
      .filter((e) => [
        'replay_tick_anim', 'ind_schedule_recalc', 'ind_async_request',
        'ind_async_coalesce_enqueue', 'ind_incremental', 'worker_post',
        'worker_message', 'ind_apply_results', 'render_schedule', 'render_paint',
        'draw_indicators', 'oracle_sample', 'observe_gap',
      ].includes(e.type))
      .slice(0, 80)
      .map((e) => ({
        dt: e.t,
        type: e.type,
        absYPx: e.absYPx ?? null,
        classification: e.classification ?? null,
        seqMatch: e.seqMatch ?? null,
        dropReason: e.dropReason ?? null,
        msgType: e.msgType ?? null,
        workerBusy: e.snap?.workerBusy ?? e.before?.workerBusy ?? e.after?.workerBusy ?? null,
        coalesce: e.snap?.workerCoalesce ?? e.coalesceAfter ?? null,
        formingClose: e.snap?.formingClose ?? e.after?.formingClose ?? null,
        bars: e.snap?.bars ?? e.after?.bars ?? null,
      })),
  };
}

async function main() {
  if (!DEPLOYED_ORIGIN) throw new Error('M19_DEPLOYED_ORIGIN required');
  if (!/^\d{8}b\d+$/.test(EXPECTED)) throw new Error('bad build id');

  const upstream = await (async () => {
    const url = `${DEPLOYED_ORIGIN}/chart/chart.js`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    const m = text.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/);
    return { ok: m?.[1] === EXPECTED, observed: m?.[1] || null };
  })();
  if (!upstream.ok) throw new Error(`build pin fail: ${upstream.observed} != ${EXPECTED}`);

  const server = await startServer();
  const browser = await launchBrowser({ headful: false });
  const cells = [];
  try {
    const boot = await bootLayout(browser, server, {
      pair: 'same',
      panels: 4,
      tf: '1m',
      bug: false,
      preDocument: installPreDocument(),
    });
    const { page } = boot;

    const hostSetup = await page.evaluate(async ({ startOffset, mix }) => {
      const first = await fetch(
        '/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles',
      ).then((r) => r.json());
      const firstBars = Array.isArray(first.candles) ? first.candles : [];
      const nextStart = Number(firstBars[firstBars.length - 1].t) + 60_000;
      const second = await fetch(
        `/api/file/25/smart?timeframe=1m&limit=100000&anchor=start&response_format=candles&start_ts=${nextStart}`,
      ).then((r) => r.json());
      const fine = firstBars.concat(Array.isArray(second.candles) ? second.candles : []);
      const chart = window.chart;
      const replay = chart?.replaySystem;
      if (!chart || !replay) return { ok: false, reason: 'no chart' };
      try { if (replay.isPlaying) replay.pause(); } catch (_e) { /* */ }
      chart.currentTimeframe = '1m';
      chart.rawData = fine;
      chart.data = fine;
      chart.bumpDataVersion?.();
      const startIndex = Math.max(1000, Math.min(fine.length - startOffset - 200, fine.length - 2500));
      replay.isActive = true;
      replay.isPlaying = false;
      replay.autoScrollEnabled = true;
      replay.playbackMode = 'tick';
      replay.tickAnimationEnabled = true;
      replay.fullRawData = fine;
      replay.fullData = fine;
      replay.rawTimeframe = '1m';
      replay.currentIndex = startIndex;
      replay.replayTimestamp = Number(fine[startIndex].t);
      replay.tickProgress = 0;
      replay.animatingCandle = null;
      replay.buildTickPathCache?.();
      replay.updateChartData?.(false);
      try {
        for (const id of (chart.indicators?.active || []).map((i) => i.id)) chart.removeIndicator?.(id);
      } catch (_e) { /* */ }
      for (const [type, params] of mix) chart.addIndicator(type, params);
      let buildId = null;
      try {
        const eng = await (await fetch('/chart/chart.js', { cache: 'no-store' })).text();
        buildId = (eng.match(/const\s+CHART_ENGINE_BUILD\s*=\s*['"](\d{8}b\d+)['"]/) || [])[1] || null;
      } catch (_e) { /* */ }
      return {
        ok: true,
        buildId,
        startIndex,
        fineCount: fine.length,
        active: (chart.indicators?.active || []).map((i) => i.type),
      };
    }, { startOffset: START_OFFSET, mix: FIVE_MA });
    if (!hostSetup?.ok) throw new Error(hostSetup?.reason || 'host setup failed');
    if (hostSetup.buildId !== EXPECTED) throw new Error(`live build ${hostSetup.buildId} != ${EXPECTED}`);

    const wrapOk = await page.evaluate(INSTALL_CHART_WRAPS);
    if (!wrapOk?.ok) throw new Error(wrapOk?.reason || 'wrap install failed');

    // Targeted cells: capture mixed 15× (up to 4), then 60×/100× once each.
    // Not a bounded-matrix repeat — stop early once case tags diversity satisfied.
    const plan = [
      { speed: 15, maxAttempts: 4, labelPrefix: '15x-causal' },
      { speed: 60, maxAttempts: 2, labelPrefix: '60x-causal' },
      { speed: 100, maxAttempts: 2, labelPrefix: '100x-causal' },
    ];

    for (const { speed, maxAttempts, labelPrefix } of plan) {
      const seen = new Set();
      for (let i = 0; i < maxAttempts; i++) {
        const label = `${labelPrefix}-${i + 1}`;
        process.stderr.write(`[causal] starting ${label}\n`);
        await page.evaluate(() => {
          const s = window.__m21ct;
          if (s) { s.events.length = 0; s.sampling = false; s.lastOracle = null; }
        });
        await page.evaluate(async ({ speed: sp }) => {
          const chart = window.chart;
          const replay = chart.replaySystem;
          const sink = window.__m21ct;
          try { if (replay.isPlaying) replay.pause(); } catch (_e) { /* */ }
          if (replay.currentIndex > replay.fullRawData.length - 80) {
            replay.currentIndex = Math.max(0, replay.fullRawData.length - 400);
            replay.replayTimestamp = Number(replay.fullRawData[replay.currentIndex].t);
            replay.updateChartData?.(false);
          }
          replay.playbackMode = 'tick';
          replay.tickAnimationEnabled = true;
          try { chart.scheduleReplayIndicatorRecalc?.(true); } catch (_e) { /* */ }
          try { chart.bumpIndicatorRenderVersion?.(); } catch (_e) { /* */ }
          try { chart.scheduleRender?.(); } catch (_e) { /* */ }
          try { chart.render?.(); } catch (_e) { /* */ }
          sink.sampling = true;
          replay.speed = sp;
          replay.updateSpeedButtonUI?.(sp);
          replay.play();
        }, { speed });

        // rAF keepalive + oracle fallback when render is coalesced away.
        await page.evaluate(() => {
          const sink = window.__m21ct;
          let id = 0;
          let n = 0;
          const loop = () => {
            n += 1;
            try {
              if (sink.sampling) {
                sink.push('raf_tick', { n, strokeTipCount: sink.lastStrokeTips?.length || 0 });
                // Fallback sample every ~8 frames if render wrap is not producing oracle rows.
                if (n % 8 === 0 && typeof sink.sampleOracle === 'function') sink.sampleOracle();
              }
            } catch (_e) { /* */ }
            if (sink.sampling) id = requestAnimationFrame(loop);
            sink._rafStop = () => { sink.sampling = false; try { cancelAnimationFrame(id); } catch (_e) { /* */ } };
          };
          id = requestAnimationFrame(loop);
        });
        await sleep(PLAY_MS);
        const raw = await page.evaluate(({ label, speed, playMs }) => {
          const chart = window.chart;
          const replay = chart?.replaySystem;
          const sink = window.__m21ct;
          try { replay?.pause?.(); } catch (_e) { /* */ }
          try { sink?._rafStop?.(); } catch (_e) { /* */ }
          if (sink) sink.sampling = false;
          // Compact events for CDP serialization (keep causal fields only).
          const compact = (sink?.events || []).map((e) => ({
            t: e.t,
            type: e.type,
            absYPx: e.absYPx ?? null,
            classification: e.classification ?? null,
            oracleOk: e.oracleOk ?? null,
            valueStale: e.valueStale ?? null,
            seqMatch: e.seqMatch ?? null,
            dropReason: e.dropReason ?? null,
            applied: e.applied ?? null,
            msgType: e.msgType ?? null,
            msgId: e.msgId ?? null,
            sameBarSkipLikely: e.sameBarSkipLikely ?? null,
            coalesceAfter: e.coalesceAfter ?? null,
            strokeTipCount: e.strokeTipCount ?? e.tipColumnCount ?? null,
            tipColumnCount: e.tipColumnCount ?? null,
            gap: e.gap ?? null,
            reason: e.reason ?? null,
            fn: e.fn ?? null,
            fromBar: e.fromBar ?? null,
            snap: e.snap ? {
              bars: e.snap.bars,
              formingClose: e.snap.formingClose,
              tickProgress: e.snap.tickProgress,
              workerBusy: e.snap.workerBusy,
              workerCoalesce: e.snap.workerCoalesce,
              workerSeq: e.snap.workerSeq,
              indRenderVersion: e.snap.indRenderVersion,
              dataVersion: e.snap.dataVersion,
              pendingRecalcRaf: e.snap.pendingRecalcRaf,
            } : null,
            before: e.before ? {
              bars: e.before.bars,
              formingClose: e.before.formingClose,
              workerBusy: e.before.workerBusy,
              workerCoalesce: e.before.workerCoalesce,
              workerSeq: e.before.workerSeq,
            } : null,
            after: e.after ? {
              bars: e.after.bars,
              formingClose: e.after.formingClose,
              workerBusy: e.after.workerBusy,
              workerCoalesce: e.after.workerCoalesce,
              workerSeq: e.after.workerSeq,
              indRenderVersion: e.after.indRenderVersion,
            } : null,
          }));
          return {
            label,
            speed,
            playMs,
            events: compact,
            coverage: { ...(sink?.coverage || {}) },
            idx: replay?.currentIndex ?? null,
            debug: {
              eventCount: sink?.events?.length ?? 0,
              lastStrokeTips: sink?.lastStrokeTips?.length ?? 0,
              activeInd: (chart?.indicators?.active || []).map((i) => i.type),
              hasDrawOpt: typeof chart?.drawIndicatorsOptimized === 'function',
              hasDraw: typeof chart?.drawIndicators === 'function',
            },
          };
        }, { label, speed, playMs: PLAY_MS });
        process.stderr.write(
          `[causal] ${label} rawEvents=${raw.debug?.eventCount} strokes=${raw.debug?.lastStrokeTips} `
          + `active=${JSON.stringify(raw.debug?.activeInd)}\n`,
        );
        const summary = summarizeCell(raw);
        cells.push(summary);
        seen.add(summary.caseTag);
        process.stderr.write(
          `[causal] ${label} case=${summary.caseTag} densOk=${summary.densityOk} `
          + `eval=${summary.evaluatedCount} maxY=${summary.maxAbsYPx?.toFixed?.(3)} `
          + `boundaries=${JSON.stringify(summary.boundaryCounts)}\n`,
        );
        // Early stop for 15× once we have clean + fail + density-short diversity (or 4 attempts).
        if (speed === 15) {
          // Prefer diversity: clean + density-short + at least one painted-fail shape.
          const hasFail = [...seen].some((t) => t.startsWith('PAINTED_FAIL'));
          if (seen.has('CLEAN_DENSITY_OK') && seen.has('DENSITY_SHORT') && hasFail) break;
          if (seen.size >= 3 && hasFail) break; // maxAttempts still caps at 4
        } else if (
          summary.caseTag.startsWith('PAINTED_FAIL')
          || summary.caseTag === 'CLEAN_DENSITY_OK'
          || summary.caseTag === 'DENSITY_SHORT'
        ) {
          // High-speed: one informative cell (not a matrix repeat).
          break;
        }
      }
    }
  } finally {
    try { await browser.close(); } catch (_e) { /* */ }
    try { server.close?.(); } catch (_e) { /* */ }
  }

  // Aggregate causal classifications.
  const allBoundaries = {};
  const confCounts = {};
  for (const c of cells) {
    for (const [b, n] of Object.entries(c.boundaryCounts || {})) {
      allBoundaries[b] = (allBoundaries[b] || 0) + n;
    }
    for (const w of c.failWindows || []) {
      const conf = w.causal?.confidence || 'LOW';
      confCounts[conf] = (confCounts[conf] || 0) + 1;
    }
  }
  const coverageUnion = {};
  for (const c of cells) {
    for (const [k, v] of Object.entries(c.observeCoverage || {})) {
      coverageUnion[k] = !!(coverageUnion[k] || v);
    }
  }
  const coverageRate = Object.values(coverageUnion).filter(Boolean).length
    / Math.max(1, Object.keys(coverageUnion).length);

  const proposedProductInstrumentation = [];
  if (!coverageUnion.workerOnMessage || !coverageUnion.workerPostMessage) {
    proposedProductInstrumentation.push(
      'Optional product marks at indicator-worker postMessage/onmessage with seq+token+barLength (no behavior change) to raise coalesce/drop confidence above harness heuristics.',
    );
  }
  if (!coverageUnion.recalcIncremental) {
    proposedProductInstrumentation.push(
      'Optional mark at recalculateIndicatorsIncremental entry with fromIndex + tipFp (observe-only) if incremental path is the dominant play route.',
    );
  }
  proposedProductInstrumentation.push(
    'If GPT verify needs higher confidence on STALE_RESULT_DROPPED: emit an explicit observe-only counter when _applyIndicatorWorkerResults returns early on seq/token mismatch (still no product behavior change).',
  );

  const blindedBundle = {
    status: STATUS,
    schema: 'm21-vy-causal-trace-blinded-v1',
    buildPin: EXPECTED,
    primary: PRIMARY,
    playMs: PLAY_MS,
    thresholdsUnchanged: { MIN_EVALUATED, MAX_Y_PX, MAX_STALE_RATIO },
    note: 'Blinded: no auth, no URLs, no hostnames. PRELIMINARY — not accepted RED/GREEN.',
    observeCoverage: coverageUnion,
    coverageRate,
    cells: cells.map((c) => ({
      label: c.label,
      speed: c.speed,
      caseTag: c.caseTag,
      densityOk: c.densityOk,
      paintedRedPreliminary: c.paintedRedPreliminary,
      evaluatedCount: c.evaluatedCount,
      maxAbsYPx: c.maxAbsYPx,
      staleRatio: c.staleRatio,
      earlyFailCount: c.earlyFailCount,
      lateFailCount: c.lateFailCount,
      boundaryCounts: c.boundaryCounts,
      failWindows: c.failWindows,
      chronologicBlindSample: c.chronologicBlindSample,
      eventTypeCounts: c.eventTypeCounts,
    })),
    aggregateBoundaries: allBoundaries,
    confidenceCounts: confCounts,
  };

  const result = {
    ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-CAUSAL-TRACE',
    status: STATUS,
    phase: 'PREPARATION-CAUSAL-TRACE',
    noGreenClaim: true,
    noAcceptedRedClaim: true,
    noProductEdits: true,
    noGateChanges: true,
    buildPin: {
      expected: EXPECTED,
      upstream: upstream.observed,
      liveHost: cells.length ? EXPECTED : null,
      match: true,
    },
    primary: PRIMARY,
    playMs: PLAY_MS,
    observeCoverage: coverageUnion,
    coverageRate,
    cells,
    aggregateBoundaries: allBoundaries,
    confidenceCounts: confCounts,
    blindedBundle,
    proposedProductInstrumentationProseOnly: proposedProductInstrumentation,
    verdict: 'M21-VY-CAUSAL-TRACE-COMPLETE-PRELIMINARY',
    pass: false,
    nextQueue: 'authenticated TEMA measurement 1a',
    signature: STATUS,
  };

  const outPath = process.env.M21_VY_CAUSAL_OUT
    ? path.resolve(process.env.M21_VY_CAUSAL_OUT)
    : path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-CAUSAL-TRACE-b61.PRELIMINARY.json');
  const blindPath = outPath.replace(/\.PRELIMINARY\.json$/i, '.BLINDED.PRELIMINARY.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(blindPath, `${JSON.stringify(blindedBundle, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    verdict: result.verdict,
    status: STATUS,
    pass: false,
    coverageRate,
    observeCoverage: coverageUnion,
    aggregateBoundaries: allBoundaries,
    confidenceCounts: confCounts,
    cellCases: cells.map((c) => ({ label: c.label, caseTag: c.caseTag, densOk: c.densityOk, maxY: c.maxAbsYPx, boundaries: c.boundaryCounts })),
    outPath,
    blindPath,
  }, null, 2)}\n`);
  process.exitCode = 0;
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 2;
});
