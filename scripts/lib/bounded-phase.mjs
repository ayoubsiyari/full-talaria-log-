/**
 * BOUNDED-PHASE-01 — no awaited readback may park the run without saying so.
 *
 * WHY THIS EXISTS. E proved `UNBOUNDED-READBACK-PARKS-NODE` in a 90-minute instrument: a readback
 * that never resolves leaves node alive, the heartbeat silent and the artifact frozen, so the run
 * looks healthy from outside and produces nothing. E's handoff names ten calls in
 * `sealed-two-arm-soak.mjs` with the same shape, and that run is TEN HOURS. A parked node at hour
 * four must be distinguishable from a healthy one before hour ten.
 *
 * WHAT `.catch()` DOES NOT DO. Several of those call sites already carry `.catch(() => fallback)`.
 * A catch handles a promise that REJECTS. It does nothing whatever for a promise that never settles,
 * which is the entire failure class here. The existing catches are why this looked covered.
 *
 * THREE THINGS THIS DOES THAT A BARE `Promise.race` DOES NOT:
 *
 * 1. Takes a THUNK, not a promise. The phase is recorded as RUNNING *before* the call is made, so a
 *    park is attributable to a named phase even if the artifact is read from outside the process.
 *    Passing a promise means it has already started before anything recorded that it had.
 *
 * 2. Neutralises the abandoned promise. On timeout the underlying operation keeps running — it
 *    cannot be cancelled — and if it later rejects, that is an unhandled rejection. Node's default
 *    for those is to terminate the process. A ten-hour soak that survives a stall only to be killed
 *    at hour nine by the stall's own late rejection has lost the same data twice. Every abandoned
 *    promise gets a terminal handler and is counted.
 *
 * 3. Emits PHASE_OVERDUE while still waiting. The timeout is the backstop; overdue is the warning.
 *    A phase budgeted at 60 s that is 200 s in should be visible in the log at 200 s, not at the
 *    timeout, because the operator's question at hour four is "is it moving", not "did it fail".
 *
 * A timeout is a NAMED STATE, never a throw and never a silent pass. Callers get a discriminated
 * result and decide; nothing here decides for them.
 */

/** Terminal states. Kept apart because they send you to different places. */
export const PHASE_OK = 'PHASE_OK';
export const PHASE_TIMEOUT = 'PHASE_TIMEOUT';
export const PHASE_THREW = 'PHASE_THREW';

/**
 * Run one readback under a deadline.
 *
 * @param {string} phase        name that will appear in the artifact and the log
 * @param {number} timeoutMs    the backstop
 * @param {() => Promise<any>} thunk  the call, NOT its promise
 * @param {object} [opts]
 * @param {number} [opts.overdueMs]   warn after this long; defaults to 60% of the timeout
 * @param {number} [opts.overdueEveryMs] repeat the warning on this interval
 * @param {(e:object)=>void} [opts.onEvent]  receives every state change, including PHASE_OVERDUE
 * @param {any} [opts.fallback] value returned with a PHASE_TIMEOUT / PHASE_THREW result
 * @returns {Promise<{state:string, value:any, phase:string, ms:number, error?:string, overdueCount:number}>}
 */
export async function boundedPhase(phase, timeoutMs, thunk, opts = {}) {
  const {
    overdueMs = Math.max(1_000, Math.round(timeoutMs * 0.6)),
    overdueEveryMs = 60_000,
    onEvent = null,
    fallback = null,
  } = opts;

  const startedAt = Date.now();
  let overdueCount = 0;
  const emit = (event) => { if (onEvent) { try { onEvent(event); } catch { /* a broken logger must not fail the run */ } } };

  emit({ state: 'PHASE_RUNNING', phase, timeoutMs, at: startedAt });

  let overdueTimer = null;
  let deadlineTimer = null;
  const armOverdue = (delay) => {
    overdueTimer = setTimeout(function tick() {
      overdueCount += 1;
      emit({ state: 'PHASE_OVERDUE', phase, waitingMs: Date.now() - startedAt, timeoutMs, overdueCount });
      overdueTimer = setTimeout(tick, overdueEveryMs);
    }, delay);
  };

  let settled = false;
  let work;
  try {
    work = Promise.resolve(thunk());
  } catch (err) {
    // A thunk that throws synchronously never produced a promise at all.
    return { state: PHASE_THREW, value: fallback, phase, ms: Date.now() - startedAt, error: String(err?.message || err).slice(0, 200), overdueCount };
  }

  const timeout = new Promise((resolve) => {
    deadlineTimer = setTimeout(() => resolve(PHASE_TIMEOUT), timeoutMs);
  });

  armOverdue(overdueMs);

  try {
    const winner = await Promise.race([
      work.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error })),
      timeout,
    ]);

    if (winner === PHASE_TIMEOUT) {
      // The operation is still running and cannot be cancelled. Give it a terminal handler so a
      // late rejection cannot take the process down hours from now, and let the caller see that
      // an orphan is outstanding.
      work.then(
        () => emit({ state: 'PHASE_LATE_RESOLVE', phase, afterMs: Date.now() - startedAt }),
        (error) => emit({ state: 'PHASE_LATE_REJECT', phase, afterMs: Date.now() - startedAt, error: String(error?.message || error).slice(0, 200) }),
      );
      const result = { state: PHASE_TIMEOUT, value: fallback, phase, ms: Date.now() - startedAt, overdueCount, abandoned: true };
      emit({ ...result, state: PHASE_TIMEOUT });
      return result;
    }

    settled = true;
    if (winner.ok) {
      const result = { state: PHASE_OK, value: winner.value, phase, ms: Date.now() - startedAt, overdueCount };
      emit(result);
      return result;
    }
    const result = {
      state: PHASE_THREW,
      value: fallback,
      phase,
      ms: Date.now() - startedAt,
      error: String(winner.error?.message || winner.error).slice(0, 200),
      overdueCount,
    };
    emit(result);
    return result;
  } finally {
    if (overdueTimer) clearTimeout(overdueTimer);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    void settled;
  }
}

/**
 * Per-sample bookkeeping across many phases.
 *
 * The soak's question is not "did this call time out" but "is this run still producing". A single
 * timeout is a bad sample; a run where every phase times out is a parked browser wearing a healthy
 * run's clothes, and the difference has to be visible in the artifact without re-reading the log.
 */
export function createPhaseRecorder({ onEvent = null } = {}) {
  const phases = [];
  let timeouts = 0;
  let threw = 0;
  let abandoned = 0;
  let consecutiveTimeouts = 0;

  return {
    /** Run a phase and record it. Never throws; the caller reads `.state`. */
    async run(phase, timeoutMs, thunk, opts = {}) {
      const result = await boundedPhase(phase, timeoutMs, thunk, { onEvent, ...opts });
      phases.push({ phase: result.phase, state: result.state, ms: result.ms, overdueCount: result.overdueCount, error: result.error ?? null });
      if (result.state === PHASE_TIMEOUT) {
        timeouts += 1;
        abandoned += 1;
        consecutiveTimeouts += 1;
      } else {
        if (result.state === PHASE_THREW) threw += 1;
        consecutiveTimeouts = 0;
      }
      return result;
    },
    /** The row that goes into the sample, so a stalled sample is legible in the artifact alone. */
    summary() {
      const slowest = phases.reduce((a, b) => (b.ms > (a?.ms ?? -1) ? b : a), null);
      return {
        signature: 'BOUNDED-PHASE-01',
        phasesRun: phases.length,
        timeouts,
        threw,
        abandonedPromises: abandoned,
        consecutiveTimeouts,
        overdue: phases.reduce((n, p) => n + (p.overdueCount || 0), 0),
        slowestPhase: slowest ? { phase: slowest.phase, ms: slowest.ms, state: slowest.state } : null,
        // A sample where every phase timed out is not a sample. Named so the reader is not left to
        // infer it from a count, and so a downstream gate can refuse it.
        sampleState: phases.length && timeouts === phases.length ? 'ALL_PHASES_TIMED_OUT'
          : timeouts ? 'DEGRADED_SOME_PHASES_TIMED_OUT'
            : threw ? 'DEGRADED_SOME_PHASES_THREW'
              : 'PHASES_COMPLETE',
        phases,
      };
    },
    reset() { phases.length = 0; timeouts = 0; threw = 0; abandoned = 0; },
    get consecutiveTimeouts() { return consecutiveTimeouts; },
  };
}

/**
 * Per-phase budgets for the soak, in one place so they can be read against the sample cadence.
 * `measureBlocking` and `measureFrameRate` have their observation window built in, so their budget
 * is the window plus headroom rather than a round number.
 */
export const SOAK_PHASE_BUDGETS_MS = {
  'sample.readPanels.before': 60_000,
  'sample.measureBlocking': 90_000,        // 20 s window inside
  'sample.measureFrameRate': 30_000,       // 3 s window inside
  'sample.readPanels.after': 60_000,
  'sample.readFootprint': 60_000,
  'sample.readArenaColumns': 120_000,      // memory-infra detailed dump, the slowest read here
  'sample.readClosed': 30_000,
  'sample.readLoafCensus': 30_000,
  'sample.readOldestOpenPositionAge': 30_000,
  'sample.readEffectiveRateReadback': 30_000,
  /**
   * The pause-probe deliberately costs ~11 minutes of delivery — the soak's own comment says so and
   * excludes the window from RATE-HOLD for that reason. A budget of five minutes, which is what I
   * first wrote, would have timed out every HEALTHY probe and reported a working instrument as a
   * permanent stall. A deadline shorter than the operation is not a safety net, it is a fault
   * injector, and it would have been indistinguishable from the bug it was added to catch.
   */
  'probe.forcedGcPauseProbe': 1_200_000,
  'probe.offlineToggle': 300_000,          // 30 s outage plus recovery, with room for a slow reconnect
};
