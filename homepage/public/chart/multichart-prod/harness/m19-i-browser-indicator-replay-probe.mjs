/**
 * M19-I real-browser acceptance: continuous 100x replay on ~90 days of 1m
 * data with an 8-indicator mix (sync-only + worker-skip + worker-eligible).
 * No timeframe switches.
 *
 * Gates (all must pass for GREEN):
 *   1. Per-bar main-thread cost is FLAT (ratio/slope) AND BOUNDED (absolute
 *      median/p95 vs 60Hz frame budget).
 *   2. Worker tail protocol is live: CALCULATE_TAIL (or successor) receives a
 *      response, clears busy within timeout, commits worker-eligible results.
 *      Direct packBarsCompact size may evidence payload complexity but MUST NOT
 *      satisfy liveness or O(tail).
 *   3. Worker postMessage payload bytes are O(tail), not O(history). Transfer
 *      list OR in-place reuse are both acceptable once payload is O(tail).
 *   4. Deterministic advances exercise scheduleReplayIndicatorRecalc; a short
 *      real play() loop proves the steady-replay scheduler advances bars and
 *      invokes that path (speed=100 alone is insufficient).
 *   5. Heap retained growth within the M19-G bound.
 *
 * Run:
 *   node m19-i-browser-indicator-replay-probe.mjs
 *   M19_FOCUS=I node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
 */
import { startServer } from './serve.mjs';
import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';

const MIB = 1024 * 1024;
const BYTES_PER_BAR_PACKED = 6 * 8; // Float64 [t,o,h,l,c,v]
const MEASURE_BARS = Math.max(40, Number(process.env.M19_I_MEASURE_BARS) || 120);
const WARMUP_BARS = Math.max(4, Number(process.env.M19_I_WARMUP_BARS) || 12);
const PACK_SAMPLE_EVERY = Math.max(1, Number(process.env.M19_I_PACK_EVERY) || 4);
const START_INDEX_OFFSET = Math.max(2_000, Number(process.env.M19_I_START_OFFSET) || 4_000);
const PLAY_CADENCE_MS = Math.max(400, Number(process.env.M19_I_PLAY_CADENCE_MS) || 800);

/** Same heap ceilings as M19-G browser resource probe. */
const HEAP_PEAK_MIB_MAX = 512;
const HEAP_AFTER_GC_MIB_MAX = 256;
const HEAP_RETAINED_GROWTH_MIB_MAX = 128;

const FRAME_RATIO_MAX = 1.25;
const SLOPE_PER_1K_MAX_FRAC = 0.05;

/**
 * Absolute main-thread budget (justified):
 * Steady replay coalesces indicator work onto rAF. At 60Hz the frame budget is
 * ~16.67ms. Per-bar-advance indicator work that exceeds one frame starves paint
 * and input even when the cost is perfectly flat across the soak — the board
 * requires cost that is BOTH flat AND bounded. Median ≤ 1 frame; p95 ≤ 2 frames.
 */
const FRAME_MS_60HZ = 1000 / 60;
const MAIN_THREAD_MEDIAN_MS_MAX = FRAME_MS_60HZ; // ≈16.67
const MAIN_THREAD_P95_MS_MAX = FRAME_MS_60HZ * 2; // ≈33.33

/** Named timeout for CALCULATE_TAIL (or successor) to respond + clear busy. */
const WORKER_TAIL_RESPONSE_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.M19_I_WORKER_TIMEOUT_MS) || 5_000,
);

/** Minimum live Worker.postMessage payload samples required for O(tail) GREEN. */
const MIN_WORKER_PAYLOAD_SAMPLES = Math.max(
  3,
  Number(process.env.M19_I_MIN_PAYLOAD_SAMPLES) || 3,
);

const EXPECTED_BUILD_ID = '20260723b57';

function metric(metrics, name) {
  const value = Number(metrics?.[name]);
  return Number.isFinite(value) ? value : 0;
}

function median(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

function slopePer1k(windowMedians) {
  if (!windowMedians.length) return NaN;
  const n = windowMedians.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = windowMedians[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const den = n * sumXX - sumX * sumX;
  if (!den) return 0;
  const slopePerWindow = (n * sumXY - sumX * sumY) / den;
  const barsPerWindow = MEASURE_BARS / Math.max(1, n);
  return slopePerWindow * (1000 / barsPerWindow);
}

async function collectGarbage(client) {
  try {
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');
  } catch (_) {}
}

function installPreDocumentHooks() {
  return {
    fn: () => {
      window.__m19iSink = {
        packBytes: [],
        postMessageBytes: [],
        postMessageTransferLens: [],
        postMessageTypes: [],
        postMessageIds: [],
        workerResponses: [],
        mainThreadMs: [],
        incrementalMs: [],
        syncRecalcCalls: 0,
        incrementalCalls: 0,
        asyncCalls: 0,
        replayRecalcCalls: 0,
        workerCommits: 0,
        workerPosts: 0,
        tailPosts: 0,
        allPosts: 0,
      };

      const installPackWrap = () => {
        const perf = window.IndicatorPerf;
        if (!perf || typeof perf.packBarsCompact !== 'function' || perf.__m19iPackWrapped) return;
        const origPack = perf.packBarsCompact.bind(perf);
        perf.packBarsCompact = function m19iPackBarsCompact(bars) {
          const packed = origPack(bars);
          try {
            window.__m19iSink.packBytes.push(
              packed && packed.byteLength != null ? packed.byteLength : 0,
            );
          } catch (_) {}
          return packed;
        };
        perf.__m19iPackWrapped = true;
      };
      installPackWrap();
      const packTimer = setInterval(installPackWrap, 25);
      setTimeout(() => clearInterval(packTimer), 15_000);

      // Patch Worker so outbound CALCULATE_* and inbound ALL_RESULTS/ERROR are visible.
      if (typeof Worker !== 'undefined' && !Worker.__m19iClassPatched) {
        const OrigWorker = Worker;
        function PatchedWorker(...args) {
          const w = new OrigWorker(...args);
          const sink = () => window.__m19iSink;

          const origPost = w.postMessage.bind(w);
          w.postMessage = function m19iPostMessage(message, transfer) {
            try {
              const s = sink();
              if (s) {
                s.workerPosts += 1;
                const type = String(message?.type || '');
                s.postMessageTypes.push(type);
                s.postMessageIds.push(message?.id != null ? message.id : null);
                if (type === 'CALCULATE_TAIL' || type === 'CALCULATE_ALL') {
                  if (type === 'CALCULATE_TAIL') s.tailPosts += 1;
                  if (type === 'CALCULATE_ALL') s.allPosts += 1;
                }
                const packed = message?.payload?.barsPacked;
                let bytes = 0;
                if (packed && typeof packed.byteLength === 'number') bytes = packed.byteLength;
                else if (Array.isArray(message?.payload?.bars)) {
                  bytes = message.payload.bars.length * 48;
                }
                s.postMessageBytes.push(bytes);
                s.postMessageTransferLens.push(Array.isArray(transfer) ? transfer.length : 0);
              }
            } catch (_) {}
            return origPost(message, transfer);
          };

          let userHandler = null;
          // Delivery plumbing only (no acceptance-semantics change): the own-property
          // accessor shadows Worker.prototype.onmessage, so the wrapped handler MUST
          // be forwarded to the native IDL setter or the browser never registers a
          // listener and every response is silently dropped (false RED for any engine).
          const protoOnMessage = (() => {
            let proto = Object.getPrototypeOf(w);
            while (proto) {
              const d = Object.getOwnPropertyDescriptor(proto, 'onmessage');
              if (d && typeof d.set === 'function') return d;
              proto = Object.getPrototypeOf(proto);
            }
            return null;
          })();
          Object.defineProperty(w, 'onmessage', {
            configurable: true,
            enumerable: true,
            get() { return userHandler; },
            set(fn) {
              userHandler = function m19iOnMessage(ev) {
                try {
                  const d = ev && ev.data;
                  const t = d && d.type;
                  if (t === 'ALL_RESULTS' || t === 'ERROR' || t === 'TAIL_RESULTS' || t === 'PONG') {
                    const s = sink();
                    if (s) {
                      s.workerResponses.push({
                        type: t,
                        id: d.id,
                        at: performance.now(),
                        hasResults: !!(d.results && typeof d.results === 'object'),
                        resultKeys: d.results ? Object.keys(d.results).length : 0,
                      });
                    }
                  }
                } catch (_) {}
                if (typeof fn === 'function') return fn.call(this, ev);
              };
              if (protoOnMessage) protoOnMessage.set.call(w, userHandler);
            },
          });
          return w;
        }
        PatchedWorker.prototype = OrigWorker.prototype;
        try {
          Object.defineProperty(PatchedWorker, 'name', { value: 'Worker' });
        } catch (_) {}
        PatchedWorker.__m19iClassPatched = true;
        window.Worker = PatchedWorker;
      }
    },
  };
}

async function setupEightIndicatorContinuousReplay(page) {
  return page.evaluate(async ({ startOffset, workerTimeoutMs }) => {
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
    if (typeof chart.scheduleReplayIndicatorRecalc !== 'function') {
      return { ok: false, reason: 'scheduleReplayIndicatorRecalc missing' };
    }
    if (typeof chart.recalculateIndicatorsIncremental !== 'function') {
      return { ok: false, reason: 'recalculateIndicatorsIncremental missing' };
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

    const indicatorSpecs = [
      ['sma', { period: 20 }],
      ['ema', { period: 50 }],
      ['rsi', { period: 14 }],
      ['macd', { fast: 12, slow: 26, signal: 9 }],
      ['bollinger', { period: 20, stdDev: 2 }],
      ['atr', { period: 14 }],
      ['talariafvg', {}],
      ['supertrend', { period: 10, multiplier: 3 }],
    ];
    const added = [];
    for (const [type, params] of indicatorSpecs) {
      try {
        const ind = chart.addIndicator(type, params);
        added.push({ type, id: ind?.id || null, ok: true });
      } catch (err) {
        added.push({ type, id: null, ok: false, error: String(err?.message || err) });
      }
    }

    const active = chart.indicators?.active || [];
    const activeTypes = active.map((ind) => String(ind.type || '').toLowerCase());
    const workerEligibleIds = active
      .filter((ind) => ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'atr']
        .includes(String(ind.type || '').toLowerCase()))
      .map((ind) => ind.id);
    const hasSyncOnly = activeTypes.some((t) => t === 'talariafvg' || t === 'sessions');
    const hasWorkerSkip = activeTypes.some((t) => t === 'supertrend' || t === 'hma');
    const hasWorkerEligible = ['sma', 'ema', 'rsi'].every((t) => activeTypes.includes(t));
    if (!hasSyncOnly || !hasWorkerSkip || !hasWorkerEligible || activeTypes.length < 8) {
      return {
        ok: false,
        reason: 'indicator mix incomplete',
        added,
        activeTypes,
        hasSyncOnly,
        hasWorkerSkip,
        hasWorkerEligible,
      };
    }

    const sink = window.__m19iSink;
    if (!sink) return { ok: false, reason: 'm19i sink missing (preDocument failed)' };

    const wrapCounted = (owner, key, counterKey) => {
      if (!owner || typeof owner[key] !== 'function' || owner[key].__m19iCounted) return;
      const original = owner[key];
      const wrapped = function m19iWrapped(...args) {
        sink[counterKey] = (sink[counterKey] || 0) + 1;
        return original.apply(this, args);
      };
      wrapped.__m19iCounted = true;
      owner[key] = wrapped;
    };
    wrapCounted(chart, 'recalculateIndicators', 'syncRecalcCalls');
    wrapCounted(chart, 'recalculateIndicatorsIncremental', 'incrementalCalls');
    wrapCounted(chart, 'recalculateIndicatorsAsync', 'asyncCalls');
    wrapCounted(chart, 'scheduleReplayIndicatorRecalc', 'replayRecalcCalls');
    wrapCounted(chart, '_applyIndicatorWorkerResults', 'workerCommits');

    const waitWorkerQuiet = async (timeoutMs) => {
      const startedAt = performance.now();
      while (chart._indicatorWorkerBusy && performance.now() - startedAt < timeoutMs) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return !chart._indicatorWorkerBusy;
    };

    const workerEligibleSeriesOk = () => {
      const dataMap = chart.indicators?.data || {};
      let ok = 0;
      for (const id of workerEligibleIds) {
        const series = dataMap[id];
        if (Array.isArray(series) && series.length >= Math.min(100, chart.data.length)) ok += 1;
        else if (series && typeof series === 'object') {
          const line = series.line || series.macd || series.upper;
          if (Array.isArray(line) && line.length >= Math.min(100, chart.data.length)) ok += 1;
        }
      }
      return { okCount: ok, need: Math.min(3, workerEligibleIds.length), ids: workerEligibleIds };
    };

    // Drain any CALCULATE_ALL from addIndicator (may also hang on other bugs).
    await waitWorkerQuiet(10_000);

    // Liveness probe: one real incremental/tail post. Do NOT treat pack size as success.
    // If a prior pass left busy stuck, record that, then clear once so we can POST a
    // fresh CALCULATE_TAIL and observe whether THAT request gets a response.
    const busyStuckBeforeProbe = chart._indicatorWorkerBusy === true;
    chart._indicatorWorkerBusy = false;
    chart._indicatorWorkerCoalesce = false;

    const responsesBefore = sink.workerResponses.length;
    const postsBefore = sink.workerPosts;
    const tailBefore = sink.tailPosts;
    const commitsBefore = sink.workerCommits;
    const historyBars = Array.isArray(chart.data) ? chart.data.length : 0;
    const prevForTail = Math.max(0, historyBars - 1);
    const probeStarted = performance.now();
    try {
      chart.recalculateIndicatorsIncremental(prevForTail);
    } catch (_) {}
    const postedTail = sink.tailPosts > tailBefore || sink.allPosts > 0;
    const postedAny = sink.workerPosts > postsBefore;
    const quiet = await waitWorkerQuiet(workerTimeoutMs);
    const probeElapsedMs = performance.now() - probeStarted;
    const newResponses = sink.workerResponses.slice(responsesBefore);
    const gotResultResponse = newResponses.some(
      (r) => r.type === 'ALL_RESULTS' || r.type === 'TAIL_RESULTS',
    );
    const gotErrorResponse = newResponses.some((r) => r.type === 'ERROR');
    const commitsDelta = sink.workerCommits - commitsBefore;
    const series = workerEligibleSeriesOk();
    // Complexity evidence only — must not satisfy liveness.
    let directPackBytes = null;
    if (window.IndicatorPerf && typeof window.IndicatorPerf.packBarsCompact === 'function') {
      try {
        const packed = window.IndicatorPerf.packBarsCompact(chart.data);
        directPackBytes = packed && packed.byteLength != null ? packed.byteLength : null;
      } catch (_) {}
    }
    const outboundBytes = sink.postMessageBytes.slice(postsBefore);
    const outboundTransfers = sink.postMessageTransferLens.slice(postsBefore);
    const outboundTypes = sink.postMessageTypes.slice(postsBefore);

    const liveness = {
      busyStuckBeforeProbe,
      postedAny,
      postedTail: sink.tailPosts > tailBefore,
      postedTypes: outboundTypes.slice(),
      responseTimeoutMs: workerTimeoutMs,
      probeElapsedMs,
      workerQuietAfterBaseline: quiet,
      gotResultResponse,
      gotErrorResponse,
      responseCount: newResponses.length,
      responses: newResponses.slice(0, 8),
      commitsDelta,
      workerEligibleSeries: series,
      pass: quiet
        && postedAny
        && gotResultResponse
        && !gotErrorResponse
        && commitsDelta > 0
        && series.okCount >= series.need,
    };

    replay.speed = 100;
    if (typeof replay.updateSpeedButtonUI === 'function') replay.updateSpeedButtonUI(100);
    const cadence = typeof replay.getCandlePlaybackCadence === 'function'
      ? replay.getCandlePlaybackCadence()
      : null;

    return {
      ok: true,
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      fineCount: fine.length,
      displayBars: Array.isArray(chart.data) ? chart.data.length : null,
      startIndex,
      startTs: Number(fine[startIndex].t),
      endTs: Number(fine[fine.length - 1].t),
      timeframe: chart.currentTimeframe,
      indicatorCount: active.length,
      activeTypes,
      added,
      hasSyncOnly,
      hasWorkerSkip,
      hasWorkerEligible,
      historyBars,
      cadence,
      liveness,
      // Complexity evidence (not a liveness substitute).
      directPackBytes,
      baselineOutboundBytes: outboundBytes.slice(),
      baselineOutboundTransfers: outboundTransfers.slice(),
      workerPosts: sink.workerPosts,
      tailPosts: sink.tailPosts,
    };
  }, { startOffset: START_INDEX_OFFSET, workerTimeoutMs: WORKER_TAIL_RESPONSE_TIMEOUT_MS });
}

async function runMeasuredAdvances(page, { warmupBars, measureBars, packEvery, workerTimeoutMs }) {
  return page.evaluate(async ({
    warmupBars: warm,
    measureBars: measure,
    packEvery: every,
    workerTimeoutMs: workerTimeout,
  }) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m19iSink;
    if (!chart || !replay || !sink) return { ok: false, reason: 'missing runtime/sink' };

    const fine = replay.fullRawData;
    const flushRaf = () => new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const waitWorkerQuiet = async (timeoutMs) => {
      const startedAt = performance.now();
      while (chart._indicatorWorkerBusy && performance.now() - startedAt < timeoutMs) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return !chart._indicatorWorkerBusy;
    };

    /**
     * Deterministic bar advance that mirrors the steady-replay hot path:
     *   play loop → updateChartData → _scheduleReplayIndicatorRecalc
     *              → scheduleReplayIndicatorRecalc(true) → rAF sync pass
     * Setting speed=100 alone does not exercise this; we invoke the same
     * scheduler entry the animation tick uses after each candle advance.
     */
    const advanceOne = async ({ measureMain, sampleWorkerPayload }) => {
      if (replay.currentIndex >= fine.length - 1) {
        return { advanced: false };
      }
      replay.isActive = true;
      replay.isPlaying = true;
      replay.currentIndex += 1;
      replay.replayTimestamp = Number(fine[replay.currentIndex].t);
      if (typeof replay.updateChartData === 'function') {
        replay.updateChartData(false);
      }

      let mainMs = 0;
      if (measureMain && typeof chart.scheduleReplayIndicatorRecalc === 'function') {
        if (chart._replayIndRecalcRaf != null) {
          cancelAnimationFrame(chart._replayIndRecalcRaf);
          chart._replayIndRecalcRaf = null;
        }
        const t0 = performance.now();
        chart.scheduleReplayIndicatorRecalc(true);
        await flushRaf();
        if (chart._replayIndRecalcRaf != null) await flushRaf();
        mainMs = performance.now() - t0;
        sink.mainThreadMs.push(mainMs);
      }

      if (sampleWorkerPayload && typeof chart.recalculateIndicatorsIncremental === 'function') {
        // Record pack complexity separately (never used as payload/liveness pass).
        if (window.IndicatorPerf && typeof window.IndicatorPerf.packBarsCompact === 'function') {
          try {
            const packed = window.IndicatorPerf.packBarsCompact(chart.data);
            sink.packBytes.push(packed && packed.byteLength != null ? packed.byteLength : 0);
          } catch (_) {}
        }
        if (!chart._indicatorWorkerBusy) {
          const fromBarCount = Math.max(0, (chart.data?.length || 1) - 1);
          const t1 = performance.now();
          try {
            chart.recalculateIndicatorsIncremental(fromBarCount);
          } catch (_) {}
          await waitWorkerQuiet(Math.min(workerTimeout, 2_000));
          sink.incrementalMs.push(performance.now() - t1);
        }
      }

      return {
        advanced: true,
        index: replay.currentIndex,
        dataLen: Array.isArray(chart.data) ? chart.data.length : null,
        mainMs,
      };
    };

    for (let i = 0; i < warm; i++) {
      const step = await advanceOne({ measureMain: false, sampleWorkerPayload: false });
      if (!step.advanced) break;
    }

    sink.mainThreadMs.length = 0;
    sink.incrementalMs.length = 0;
    sink.packBytes.length = 0;
    const postOffset = sink.postMessageBytes.length;
    const transferOffset = sink.postMessageTransferLens.length;
    const typeOffset = sink.postMessageTypes.length;
    const responseOffset = sink.workerResponses.length;

    const steps = [];
    for (let i = 0; i < measure; i++) {
      const step = await advanceOne({
        measureMain: true,
        sampleWorkerPayload: i % every === 0,
      });
      if (!step.advanced) break;
      steps.push(step);
    }

    replay.isPlaying = false;
    if (typeof chart.scheduleReplayIndicatorRecalc === 'function') {
      try { chart.scheduleReplayIndicatorRecalc(false); } catch (_) {}
      await flushRaf();
    }

    const lookback = (window.IndicatorPerf
      && typeof window.IndicatorPerf.estimateTailLookback === 'function')
      ? window.IndicatorPerf.estimateTailLookback(chart.indicators?.active || [])
      : 256;

    return {
      ok: true,
      steps: steps.length,
      warmupBars: warm,
      measureBars: measure,
      endIndex: replay.currentIndex,
      endDataLen: Array.isArray(chart.data) ? chart.data.length : null,
      timeframe: chart.currentTimeframe,
      lookback,
      schedulerPath: 'updateChartData + scheduleReplayIndicatorRecalc(true) + rAF flush',
      sink: {
        mainThreadMs: sink.mainThreadMs.slice(),
        incrementalMs: sink.incrementalMs.slice(),
        packBytes: sink.packBytes.slice(),
        postMessageBytes: sink.postMessageBytes.slice(postOffset),
        postMessageTransferLens: sink.postMessageTransferLens.slice(transferOffset),
        postMessageTypes: sink.postMessageTypes.slice(typeOffset),
        workerResponses: sink.workerResponses.slice(responseOffset),
        syncRecalcCalls: sink.syncRecalcCalls,
        incrementalCalls: sink.incrementalCalls,
        asyncCalls: sink.asyncCalls,
        replayRecalcCalls: sink.replayRecalcCalls,
        workerCommits: sink.workerCommits,
        workerPosts: sink.workerPosts,
        tailPosts: sink.tailPosts,
        allPosts: sink.allPosts,
      },
    };
  }, {
    warmupBars,
    measureBars,
    packEvery,
    workerTimeoutMs,
  });
}

async function runPlayCadenceCheck(page, playMs) {
  return page.evaluate(async (ms) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const sink = window.__m19iSink;
    if (!chart || !replay || !sink) return { ok: false, reason: 'missing runtime' };

    try {
      if (replay.isPlaying && typeof replay.pause === 'function') replay.pause();
    } catch (_) {}

    // Leave enough runway for the play loop to advance several candles.
    if (replay.currentIndex > replay.fullRawData.length - 50) {
      replay.currentIndex = Math.max(0, replay.fullRawData.length - 200);
      replay.replayTimestamp = Number(replay.fullRawData[replay.currentIndex].t);
      if (typeof replay.updateChartData === 'function') replay.updateChartData(false);
    }

    replay.speed = 100;
    if (typeof replay.updateSpeedButtonUI === 'function') replay.updateSpeedButtonUI(100);
    const cadence = typeof replay.getCandlePlaybackCadence === 'function'
      ? replay.getCandlePlaybackCadence()
      : null;

    const idx0 = replay.currentIndex;
    const ts0 = Number(replay.replayTimestamp);
    const recalc0 = sink.replayRecalcCalls;
    const speedAloneDoesNotAdvance = true; // documented: we still call play()

    if (typeof replay.play !== 'function') {
      return { ok: false, reason: 'replay.play missing' };
    }
    replay.play();
    await new Promise((r) => setTimeout(r, ms));
    const playingDuring = !!replay.isPlaying;
    const idx1 = replay.currentIndex;
    const ts1 = Number(replay.replayTimestamp);
    const recalc1 = sink.replayRecalcCalls;
    try { replay.pause(); } catch (_) {}

    const indexDelta = idx1 - idx0;
    const tsDelta = ts1 - ts0;
    const recalcDelta = recalc1 - recalc0;
    return {
      ok: true,
      speed: replay.speed,
      cadence,
      playMs: ms,
      playingDuring,
      indexDelta,
      tsDelta,
      recalcDelta,
      speedAloneDoesNotAdvance,
      note: 'Requires replay.play() — setting speed=100 without play does not advance bars or invoke scheduleReplayIndicatorRecalc.',
      pass: playingDuring
        && (indexDelta > 0 || tsDelta > 0)
        && recalcDelta > 0
        && Number(cadence?.stepsPerTick) >= 1,
    };
  }, playMs);
}

// Switch-OFF discriminator plumbing ONLY (no acceptance-semantics change):
// M19_I_KILL_SWITCHES="__TALARIA_DISABLE_M19I_TAIL_SEND_V1,..." injects the named
// window flags before any engine script so the SAME instrument reproduces each
// legacy RED. Empty (default) = clean GREEN gate run.
const KILL_SWITCHES = String(process.env.M19_I_KILL_SWITCHES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const server = await startServer();
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
    const client = await page.createCDPSession();
    await client.send('Performance.enable');

    const setup = await setupEightIndicatorContinuousReplay(page);
    if (!setup?.ok) throw new Error(setup?.reason || 'setup failed');

    await sleep(100);
    await collectGarbage(client);
    const before = await page.metrics();

    const started = Date.now();
    let peakHeap = metric(before, 'JSHeapUsedSize');
    const measured = await runMeasuredAdvances(page, {
      warmupBars: WARMUP_BARS,
      measureBars: MEASURE_BARS,
      packEvery: PACK_SAMPLE_EVERY,
      workerTimeoutMs: WORKER_TAIL_RESPONSE_TIMEOUT_MS,
    });
    if (!measured?.ok) throw new Error(measured?.reason || 'measure failed');

    const playCadence = await runPlayCadenceCheck(page, PLAY_CADENCE_MS);

    const mid = await page.metrics();
    peakHeap = Math.max(peakHeap, metric(mid, 'JSHeapUsedSize'));

    await page.evaluate(() => {
      try { window.chart?.replaySystem?.pause?.(); } catch (_) {}
    });
    const beforeGc = await page.metrics();
    peakHeap = Math.max(peakHeap, metric(beforeGc, 'JSHeapUsedSize'));
    await collectGarbage(client);
    const afterGc = await page.metrics();
    const elapsedMs = Date.now() - started;

    const mainCosts = measured.sink.mainThreadMs || [];
    const windows = 5;
    const windowSize = Math.max(1, Math.floor(mainCosts.length / windows));
    const windowMedians = [];
    for (let w = 0; w < windows; w++) {
      const slice = mainCosts.slice(w * windowSize, (w + 1) * windowSize);
      if (slice.length) windowMedians.push(median(slice));
    }
    const firstMed = windowMedians[0];
    const lastMed = windowMedians[windowMedians.length - 1];
    const ratio = firstMed > 0 ? lastMed / firstMed : NaN;
    const slope1k = slopePer1k(windowMedians);
    const slopeFrac = firstMed > 0 ? slope1k / firstMed : NaN;
    const medianMs = median(mainCosts);
    const p95Ms = percentile(mainCosts, 95);

    // Payload gate uses ONLY live Worker.postMessage samples — never direct pack.
    const postBytes = measured.sink.postMessageBytes || [];
    const baselinePost = setup.baselineOutboundBytes || [];
    const livePostBytes = postBytes.length ? postBytes : baselinePost;
    const transferLens = (measured.sink.postMessageTransferLens || []).length
      ? measured.sink.postMessageTransferLens
      : (setup.baselineOutboundTransfers || []);
    const medianPost = median(livePostBytes);
    const packComplexityBytes = median(measured.sink.packBytes || [])
      || setup.directPackBytes
      || null;
    const maxPost = livePostBytes.length ? Math.max(...livePostBytes) : 0;
    const endBars = measured.endDataLen || setup.displayBars || setup.fineCount;
    const historyBytes = endBars * BYTES_PER_BAR_PACKED;
    const tailBudgetBytes = Math.max(256, measured.lookback || 256) * BYTES_PER_BAR_PACKED * 2;
    const payloadIsOHistory = Number.isFinite(medianPost) && medianPost >= historyBytes * 0.5;
    const payloadIsOTail = Number.isFinite(medianPost) && medianPost <= tailBudgetBytes;
    const emptyTransfers = transferLens.filter((n) => n === 0).length;
    const nonemptyTransfers = transferLens.filter((n) => n > 0).length;
    // Accept transfer OR reuse once payload is O(tail); do not require one strategy.
    const transferStrategy = nonemptyTransfers > 0
      ? 'transfer-list'
      : (payloadIsOTail ? 'reuse-or-copy-within-tail-budget' : 'clone-empty-transfer-list');

    const memoryMiB = {
      before: +(metric(before, 'JSHeapUsedSize') / MIB).toFixed(1),
      peak: +(peakHeap / MIB).toFixed(1),
      beforeGc: +(metric(beforeGc, 'JSHeapUsedSize') / MIB).toFixed(1),
      afterGc: +(metric(afterGc, 'JSHeapUsedSize') / MIB).toFixed(1),
      retainedGrowth: +(
        (metric(afterGc, 'JSHeapUsedSize') - metric(before, 'JSHeapUsedSize')) / MIB
      ).toFixed(1),
    };

    const liveness = setup.liveness || {};
    const asserts = {
      buildId: {
        pass: setup.buildId === EXPECTED_BUILD_ID,
        value: setup.buildId,
        expected: EXPECTED_BUILD_ID,
      },
      fineCount: {
        pass: setup.fineCount >= 129_000,
        value: setup.fineCount,
        limit: 129_000,
      },
      indicatorMix: {
        pass: setup.indicatorCount >= 8
          && setup.hasSyncOnly
          && setup.hasWorkerSkip
          && setup.hasWorkerEligible,
        indicatorCount: setup.indicatorCount,
        activeTypes: setup.activeTypes,
      },
      noTimeframeSwitch: {
        pass: measured.timeframe === '1m' && setup.timeframe === '1m',
        timeframe: measured.timeframe,
      },
      mainThreadRatio: {
        pass: Number.isFinite(ratio) && ratio <= FRAME_RATIO_MAX,
        firstMed,
        lastMed,
        ratio,
        limit: FRAME_RATIO_MAX,
      },
      mainThreadSlope: {
        pass: Number.isFinite(slopeFrac) && slopeFrac <= SLOPE_PER_1K_MAX_FRAC,
        slopePer1k: slope1k,
        slopeFracOfFirst: slopeFrac,
        limitFrac: SLOPE_PER_1K_MAX_FRAC,
      },
      mainThreadAbsoluteBudget: {
        pass: Number.isFinite(medianMs) && medianMs <= MAIN_THREAD_MEDIAN_MS_MAX
          && Number.isFinite(p95Ms) && p95Ms <= MAIN_THREAD_P95_MS_MAX,
        medianMs,
        p95Ms,
        medianLimitMs: MAIN_THREAD_MEDIAN_MS_MAX,
        p95LimitMs: MAIN_THREAD_P95_MS_MAX,
        justification: '60Hz frame budget: median ≤ 1 frame (16.67ms), p95 ≤ 2 frames (33.33ms). Flat-but-expensive sync recompute (~100ms+/bar) must RED.',
      },
      workerLiveness: {
        pass: liveness.pass === true,
        ...liveness,
        timeoutMs: WORKER_TAIL_RESPONSE_TIMEOUT_MS,
        note: 'Requires CALCULATE_TAIL/ALL response + busy clear + worker commit of eligible series. directPackBytes is complexity evidence only and cannot pass this gate.',
        directPackBytesComplexityOnly: setup.directPackBytes,
      },
      payloadOTail: {
        // Live Worker.postMessage samples required — pack fallback cannot pass.
        pass: livePostBytes.length >= MIN_WORKER_PAYLOAD_SAMPLES
          && payloadIsOTail
          && !payloadIsOHistory
          && liveness.pass === true,
        medianPostMessageBytes: medianPost,
        maxPostMessageBytes: maxPost,
        packComplexityBytes,
        historyBytes,
        tailBudgetBytes,
        payloadClass: !Number.isFinite(medianPost)
          ? 'no-live-worker-samples'
          : (payloadIsOHistory ? 'O(history)' : (payloadIsOTail ? 'O(tail)' : 'unknown')),
        workerPostSamples: livePostBytes.length,
        minWorkerPostSamples: MIN_WORKER_PAYLOAD_SAMPLES,
        emptyTransferCount: emptyTransfers,
        nonemptyTransferCount: nonemptyTransfers,
        transferStrategy,
        note: 'O(tail) judged on Worker.postMessage bytes only. Transfer-list or reuse OK once payload ≤ tail budget; empty-transfer O(history) clone is RED.',
      },
      steadyReplayScheduler: {
        pass: (measured.sink.replayRecalcCalls || 0) > 0
          && (measured.sink.syncRecalcCalls || 0) > 0
          && measured.steps >= MEASURE_BARS * 0.9
          && playCadence?.pass === true,
        deterministicPath: measured.schedulerPath,
        deterministicSteps: measured.steps,
        replayRecalcCalls: measured.sink.replayRecalcCalls,
        syncRecalcCalls: measured.sink.syncRecalcCalls,
        playCadence,
        note: 'Deterministic loop advances candles via updateChartData + scheduleReplayIndicatorRecalc; playCadence confirms replay.play() at speed=100 also advances bars and invokes the same scheduler.',
      },
      heapPeak: {
        pass: memoryMiB.peak <= HEAP_PEAK_MIB_MAX,
        value: memoryMiB.peak,
        limit: HEAP_PEAK_MIB_MAX,
      },
      heapAfterGc: {
        pass: memoryMiB.afterGc <= HEAP_AFTER_GC_MIB_MAX,
        value: memoryMiB.afterGc,
        limit: HEAP_AFTER_GC_MIB_MAX,
      },
      heapRetainedGrowth: {
        pass: memoryMiB.retainedGrowth <= HEAP_RETAINED_GROWTH_MIB_MAX,
        value: memoryMiB.retainedGrowth,
        limit: HEAP_RETAINED_GROWTH_MIB_MAX,
      },
    };

    const green = Object.values(asserts).every((a) => a.pass === true);
    const result = {
      ticket: 'M19-I',
      scenario: 'one-panel / 90-day 1m feed / 100x continuous replay / 8 indicators / NO TF switches',
      killSwitchesInjected: KILL_SWITCHES,
      buildId: setup.buildId,
      setup,
      measured: {
        steps: measured.steps,
        endIndex: measured.endIndex,
        endDataLen: measured.endDataLen,
        timeframe: measured.timeframe,
        lookback: measured.lookback,
        schedulerPath: measured.schedulerPath,
        windowMedians,
        mainThreadMsSummary: {
          n: mainCosts.length,
          firstMed,
          lastMed,
          ratio,
          slopePer1k: slope1k,
          slopeFracOfFirst: slopeFrac,
          medianMs,
          p95Ms,
          maxMs: mainCosts.length ? Math.max(...mainCosts) : 0,
          absoluteBudget: {
            medianLimitMs: MAIN_THREAD_MEDIAN_MS_MAX,
            p95LimitMs: MAIN_THREAD_P95_MS_MAX,
          },
        },
        playCadence,
        sink: measured.sink,
      },
      elapsedMs,
      memoryMiB,
      taskDurationSeconds: +(
        metric(beforeGc, 'TaskDuration') - metric(before, 'TaskDuration')
      ).toFixed(3),
      asserts,
      verdict: green ? 'M19-I-GREEN' : 'M19-I-RED',
      pass: green,
      note: green
        ? 'All M19-I gates held (flat+bounded main-thread, worker liveness, O(tail) payloads, steady-replay scheduler).'
        : 'Required RED on b57 without M19-I fixes: expect absolute main-thread over-budget and/or wedged CALCULATE_TAIL worker and/or O(history) payloads.',
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
