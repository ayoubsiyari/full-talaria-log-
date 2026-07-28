import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B75_ROWS, classifyFocusJitter, classifyReplayStartFreeze,
  classifySaturationRecurrence, classifySymbolLatency,
  classifyTimeframePersistence, triageOrder,
} from './b75-new-mechanism-oracles.mjs';

test('five new rows remain separate from closed B70 rows', () => {
  assert.equal(B75_ROWS.length, 5);
  assert.ok(B75_ROWS.every((row) => row.id.startsWith('B75-N')));
  assert.deepEqual(triageOrder().map((row) => row.id),
    ['B75-N3', 'B75-N1', 'B75-N2', 'B75-N4', 'B75-N5']);
});

test('N1 RED and fast generation-safe control', () => {
  assert.equal(classifySymbolLatency({
    intentAt: 0, requestAt: 59_000, visibleCommitAt: 60_100,
    supersededAt: 100, abortAt: 59_000, committedGeneration: 3,
    latestGeneration: 4, staleCommitCount: 1, pendingOlderGeneration: true,
  }).verdict, 'RED_SYMBOL_CHANGE_60S');
  assert.equal(classifySymbolLatency({
    intentAt: 0, requestAt: 4, visibleCommitAt: 900,
    supersededAt: 1, abortAt: 4, committedGeneration: 4,
    latestGeneration: 4, staleCommitCount: 0,
  }).verdict, 'CONTROL_PASS');
});

test('N2 requires visible unfocused recovery after click', () => {
  assert.equal(classifyFocusJitter({
    visibilityState: 'visible', documentHasFocus: false,
    preClickJitterPx: 12, postClickJitterPx: 0,
    preClickMaxRafGapMs: 900, postClickMaxRafGapMs: 20,
  }).verdict, 'RED_FOCUS_DEPENDENT_RAF_JITTER');
  assert.equal(classifyFocusJitter({
    visibilityState: 'visible', documentHasFocus: true,
    maxRafGapMs: 17, jitterPx: 0,
  }).verdict, 'CONTROL_PASS');
});

test('N3 identifies isolated start barrier then burst', () => {
  assert.equal(classifyReplayStartFreeze({
    playIntentAt: 0, firstAdvanceAt: 15_200,
    barrierEnteredAt: 4, barrierReleasedAt: 15_010,
    affectedPanelCount: 1, peerPanelsAdvanced: true,
    catchupRateRatio: 8, frameQueueMax: 61,
  }).verdict, 'RED_ONE_PANEL_START_FREEZE_BURST');
});

test('N4 requires per-session per-panel exact hydration', () => {
  assert.equal(classifyTimeframePersistence({
    panelCount: 4, storageScope: 'global',
    savedPanelTimeframes: ['1m'], reopenedPanelTimeframes: ['15m', '15m', '15m', '15m'],
  }).verdict, 'RED_TIMEFRAME_HYDRATION_SCOPE');
  assert.equal(classifyTimeframePersistence({
    panelCount: 4, storageScope: 'per-session-per-panel',
    savedPanelTimeframes: ['1m', '5m', '15m', '1h'],
    reopenedPanelTimeframes: ['1m', '5m', '15m', '1h'],
  }).verdict, 'CONTROL_PASS');
});

const switchState = (disabled) => Object.fromEntries([
  'TAIL_SEND', 'SYNCONLY_TAIL', 'WORKER_PORT', 'FORCE_DEDUPE',
  'FRAME_COHERENT', 'TICK_COHERENT', 'EXACT_TAIL_PAINT',
].map((stem) => [`__TALARIA_DISABLE_M19I_${stem}_V1`, disabled]));

test('N5 distinguishes saturation from regression without cure-failure claim', () => {
  const result = classifySaturationRecurrence({
    cureOn: { speed: 60, cpuPercent: 128, indicatorLagFrames: 12,
      lagLimitFrames: 2, killSwitches: switchState(false) },
    cureOff: { speed: 60, cpuPercent: 129, indicatorLagFrames: 13,
      lagLimitFrames: 2, killSwitches: switchState(true) },
    control: { indicatorLagFrames: 1, lagLimitFrames: 2 },
  });
  assert.equal(result.verdict, 'NEW_SATURATION_MECHANISM');
  assert.match(result.claim, /does not.*claim cure failure/i);
});
