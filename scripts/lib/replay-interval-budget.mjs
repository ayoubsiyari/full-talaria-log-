/**
 * REPLAY-INTERVAL-BUDGET-V1 — fail if any setInterval callback blocks longer
 * than the budget during live replay. PO console showed 55 / 82 / 95 ms ticks.
 */

export const REPLAY_INTERVAL_BUDGET_SIGNATURE = 'TALARIA_REPLAY_INTERVAL_BUDGET_V1';
/** Hard budget (ms). PO saw 55/82/95 — anything ≥50 is the defect band. */
export const REPLAY_INTERVAL_CALLBACK_BUDGET_MS = 50;
export const REPLAY_INTERVAL_OBSERVE_MS = 8_000;

/**
 * Install in-page wrappers that record setInterval callback wall durations.
 * Also observes longtask entries for corroboration.
 */
export function installReplayIntervalBudgetProbeSource({
  budgetMs = REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
} = {}) {
  return `(() => {
    if (window.__talariaReplayIntervalBudget) return window.__talariaReplayIntervalBudget;
    const budgetMs = ${Number(budgetMs)};
    const state = {
      installedAt: Date.now(),
      budgetMs,
      samples: [],
      violations: [],
      longTasks: [],
      intervalCallbacks: 0,
    };
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = function talariaBudgetSetInterval(fn, delay, ...args) {
      if (typeof fn !== 'function') return nativeSetInterval(fn, delay, ...args);
      const wrapped = function talariaBudgetIntervalCallback(...cbArgs) {
        const t0 = performance.now();
        try { return fn.apply(this, cbArgs); }
        finally {
          const dur = performance.now() - t0;
          state.intervalCallbacks += 1;
          const sample = {
            ms: dur,
            delay: Number(delay) || 0,
            name: fn.name || 'anonymous',
            at: Date.now(),
          };
          try {
            const err = new Error('interval-stack');
            sample.stack = String(err.stack || '')
              .split('\\n')
              .map((l) => l.trim())
              .filter((l) => l && !/talariaBudget|interval-stack|nativeSetInterval/.test(l))
              .slice(0, 6);
          } catch (_) {}
          state.samples.push(sample);
          if (state.samples.length > 400) state.samples.shift();
          if (dur > budgetMs) {
            state.violations.push(sample);
            if (state.violations.length > 100) state.violations.shift();
          }
        }
      };
      return nativeSetInterval(wrapped, delay, ...args);
    };
    window.clearInterval = nativeClearInterval;
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            ms: entry.duration,
            name: entry.name || 'longtask',
            at: Date.now(),
          });
          if (state.longTasks.length > 100) state.longTasks.shift();
        }
      });
      po.observe({ type: 'longtask', buffered: true });
      state.longTaskObserver = true;
    } catch (_) {
      state.longTaskObserver = false;
    }
    window.__talariaReplayIntervalBudget = state;
    return state;
  })()`;
}

export function summarizeReplayIntervalBudget(state, {
  budgetMs = REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
} = {}) {
  const samples = Array.isArray(state?.samples) ? state.samples : [];
  const violations = Array.isArray(state?.violations) ? state.violations : [];
  const longTasks = Array.isArray(state?.longTasks) ? state.longTasks : [];
  const maxMs = samples.reduce((m, s) => Math.max(m, Number(s.ms) || 0), 0);
  const p95 = percentile(samples.map((s) => Number(s.ms) || 0), 0.95);
  const pass = violations.length === 0 && maxMs <= budgetMs;
  return {
    signature: REPLAY_INTERVAL_BUDGET_SIGNATURE,
    pass,
    budgetMs,
    intervalCallbacks: Number(state?.intervalCallbacks) || samples.length,
    sampleCount: samples.length,
    violationCount: violations.length,
    maxCallbackMs: maxMs,
    p95CallbackMs: p95,
    longTaskCount: longTasks.length,
    maxLongTaskMs: longTasks.reduce((m, s) => Math.max(m, Number(s.ms) || 0), 0),
    topViolations: violations
      .slice()
      .sort((a, b) => (b.ms || 0) - (a.ms || 0))
      .slice(0, 10),
  };
}

function percentile(values, p) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * p) - 1));
  return nums[idx];
}

export function assertReplayIntervalBudget(summary) {
  const cells = [];
  const instrumented = !!summary
    && summary.signature === REPLAY_INTERVAL_BUDGET_SIGNATURE
    && Number(summary.intervalCallbacks) > 0;
  cells.push({
    name: 'REPLAY-INTERVAL-BUDGET-INSTRUMENTED',
    pass: instrumented,
    status: instrumented ? 'GREEN' : 'RED',
    detail: instrumented
      ? `observed ${summary.intervalCallbacks} interval callbacks`
      : 'no interval callbacks observed — probe blind or replay idle',
    blocking: true,
  });
  const within = !!summary && summary.pass === true;
  cells.push({
    name: 'REPLAY-INTERVAL-CALLBACK-WITHIN-BUDGET',
    pass: within,
    status: within ? 'GREEN' : 'RED',
    detail: !summary
      ? 'summary missing'
      : `max=${summary.maxCallbackMs?.toFixed?.(1) ?? summary.maxCallbackMs}ms p95=${summary.p95CallbackMs?.toFixed?.(1) ?? summary.p95CallbackMs}ms budget=${summary.budgetMs}ms violations=${summary.violationCount}`,
    blocking: true,
    metrics: summary,
  });
  // Corroboration: PO's 55/82/95ms console lines may be longtasks even when
  // wrapped setInterval callbacks are short (rAF / microtask / unwrapped timers).
  const longMax = Number(summary?.maxLongTaskMs) || 0;
  const longOk = longMax <= budgetFrom(summary);
  cells.push({
    name: 'REPLAY-LONGTASK-CORROBORATION',
    pass: longOk,
    status: longOk ? 'GREEN' : 'RED',
    detail: `maxLongTask=${longMax.toFixed?.(1) ?? longMax}ms count=${summary?.longTaskCount ?? 0} budget=${budgetFrom(summary)}ms`,
    blocking: false,
    nonBlocking: true,
  });
  return cells;
}

function budgetFrom(summary) {
  return Number(summary?.budgetMs) || REPLAY_INTERVAL_CALLBACK_BUDGET_MS;
}
