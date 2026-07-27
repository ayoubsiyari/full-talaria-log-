import assert from 'node:assert/strict';
import test from 'node:test';

export const B75_ROWS = Object.freeze([
  { id: 'B75-N1', ticket: 'B75-SYMBOL-60S', mechanism: 'symbol-request-generation', triage: 2 },
  { id: 'B75-N2', ticket: 'B75-FOCUS-JITTER', mechanism: 'focus-raf-throttling', triage: 3 },
  { id: 'B75-N3', ticket: 'B75-REPLAY-START-FREEZE', mechanism: 'replay-start-barrier', triage: 1 },
  { id: 'B75-N4', ticket: 'B75-TF-REOPEN-PERSISTENCE', mechanism: 'timeframe-hydration-scope', triage: 4 },
  { id: 'B75-N5', ticket: 'B75-60X-SATURATION', mechanism: 'host-indicator-saturation', triage: 5 },
]);

const finite = (v) => Number.isFinite(Number(v));
const delta = (a, b) => finite(a) && finite(b) ? Number(b) - Number(a) : null;

export function classifySymbolLatency(trace, { redMs = 55_000, controlMs = 5_000 } = {}) {
  const latencyMs = delta(trace.intentAt, trace.visibleCommitAt);
  const abortLatencyMs = delta(trace.supersededAt, trace.abortAt);
  const generationSafe = trace.committedGeneration === trace.latestGeneration
    && trace.staleCommitCount === 0;
  const red = latencyMs >= redMs && (!finite(trace.requestAt)
    || delta(trace.intentAt, trace.requestAt) >= redMs
    || trace.pendingOlderGeneration === true);
  const control = latencyMs <= controlMs && generationSafe;
  return { verdict: red ? 'RED_SYMBOL_CHANGE_60S' : control ? 'CONTROL_PASS' : 'INCONCLUSIVE',
    latencyMs, abortLatencyMs, generationSafe };
}

export function classifyFocusJitter(trace, { maxFocusedRafGapMs = 100, minRecoveryRatio = 3 } = {}) {
  const hidden = trace.visibilityState === 'hidden';
  const focusCure = trace.preClickJitterPx > 0
    && trace.postClickJitterPx === 0
    && trace.preClickMaxRafGapMs >= trace.postClickMaxRafGapMs * minRecoveryRatio;
  const red = !hidden && trace.documentHasFocus === false && focusCure;
  const control = !hidden && trace.documentHasFocus === true
    && trace.maxRafGapMs <= maxFocusedRafGapMs && trace.jitterPx === 0;
  return { verdict: red ? 'RED_FOCUS_DEPENDENT_RAF_JITTER' : control ? 'CONTROL_PASS' : 'INCONCLUSIVE',
    focusCure, hidden };
}

export function classifyReplayStartFreeze(trace, { redMs = 12_000, burstRatio = 3 } = {}) {
  const freezeMs = delta(trace.playIntentAt, trace.firstAdvanceAt);
  const isolatedOwner = trace.affectedPanelCount === 1 && trace.peerPanelsAdvanced === true;
  const barrierDelayMs = delta(trace.barrierEnteredAt, trace.barrierReleasedAt);
  const red = freezeMs >= redMs && isolatedOwner && trace.catchupRateRatio >= burstRatio;
  const control = freezeMs < 2_000 && trace.catchupRateRatio <= 1.5 && trace.frameQueueMax <= 2;
  return { verdict: red ? 'RED_ONE_PANEL_START_FREEZE_BURST' : control ? 'CONTROL_PASS' : 'INCONCLUSIVE',
    freezeMs, barrierDelayMs, isolatedOwner };
}

export function classifyTimeframePersistence(trace) {
  const perPanelSaved = trace.savedPanelTimeframes?.length === trace.panelCount;
  const exactHydration = perPanelSaved && trace.savedPanelTimeframes.every(
    (tf, i) => tf === trace.reopenedPanelTimeframes?.[i]);
  const red = trace.storageScope !== 'per-session-per-panel' || !exactHydration;
  return { verdict: red ? 'RED_TIMEFRAME_HYDRATION_SCOPE' : 'CONTROL_PASS',
    perPanelSaved, exactHydration, storageScope: trace.storageScope };
}

export function classifySaturationRecurrence({ cureOn, cureOff, control }) {
  const requiredSwitches = [
    '__TALARIA_DISABLE_M19I_TAIL_SEND_V1',
    '__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1',
    '__TALARIA_DISABLE_M19I_WORKER_PORT_V1',
    '__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1',
    '__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1',
    '__TALARIA_DISABLE_M19I_TICK_COHERENT_V1',
    '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1',
  ];
  const statesComplete = [cureOn, cureOff].every((cell) =>
    requiredSwitches.every((name) => typeof cell.killSwitches?.[name] === 'boolean'));
  if (!statesComplete || !finite(cureOn.cpuPercent) || !finite(cureOff.cpuPercent)) {
    return { verdict: 'INCONCLUSIVE', statesComplete };
  }
  const onLag = cureOn.indicatorLagFrames > cureOn.lagLimitFrames;
  const offLag = cureOff.indicatorLagFrames > cureOff.lagLimitFrames;
  const saturated = cureOn.cpuPercent >= 120 && cureOn.speed === 60;
  let verdict = 'NO_RECURRENCE';
  if (saturated && onLag && offLag && control.indicatorLagFrames <= control.lagLimitFrames) {
    verdict = 'NEW_SATURATION_MECHANISM';
  } else if (onLag && !offLag) {
    verdict = 'POSSIBLE_REGRESSION_REQUIRES_REPEAT';
  }
  return { verdict, statesComplete, cureOnLag: onLag, cureOffLag: offLag,
    claim: 'ON/OFF comparison classifies mechanism; it does not by itself claim cure failure.' };
}

export function triageOrder() {
  return [...B75_ROWS].sort((a, b) => a.triage - b.triage);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  test('module self-test placeholder', () => assert.equal(B75_ROWS.length, 5));
}
