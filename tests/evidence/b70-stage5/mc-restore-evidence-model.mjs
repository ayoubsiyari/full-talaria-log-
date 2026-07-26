export const DEADLINE_MS = 10_000;
export const MISSING_TICKER_REASON = 'MISSING_SAVED_TICKER';

export function validateLayout(layout) {
  if (layout !== '3v') throw new Error('MC_RESTORE requires exact valid layout 3v');
  return true;
}

export function strictIdentity(panel, expected, generation) {
  const values = [panel?.ticker, panel?.fileId, panel?.sessionId, panel?.timeframe];
  return Number.isFinite(generation)
    && Number.isFinite(panel?.appliedGeneration)
    && values.every((value) => value && value !== 'null')
    && panel.fileId === expected.fileId
    && panel.ticker === expected.ticker
    && panel.sessionId === expected.sessionId
    && panel.timeframe === expected.timeframe
    && panel.generation === generation
    && panel.appliedGeneration === generation
    && panel.bars > 0
    && panel.nonblack > 0;
}

export function classifyPanel(panel, expected, deadlineMs = DEADLINE_MS) {
  if (!expected?.ticker || !expected?.fileId) {
    return { pass: false, reason: MISSING_TICKER_REASON, owner: 'saved-layout-state' };
  }
  if (panel?.ticker !== expected.ticker || String(panel?.fileId) !== String(expected.fileId)) {
    return { pass: false, reason: 'RESTORED_IDENTITY_MISMATCH', owner: 'layout-restore-owner' };
  }
  if (!panel?.nonblank) return { pass: false, reason: 'BLACK_CANVAS', owner: 'chart-renderer' };
  if (!Number.isFinite(panel?.paintMs) || panel.paintMs > deadlineMs) {
    return { pass: false, reason: 'PAINT_DEADLINE_EXCEEDED', owner: 'restore-barrier' };
  }
  return { pass: true, reason: null, owner: null, elapsedMs: panel.paintMs };
}

export function summarizeAb(off, onRuns) {
  return {
    offRed: off.every((panel) => !panel.pass),
    onGreen: onRuns.length >= 10
      && onRuns.every((run) => run.length === 3 && run.every((panel) => panel.pass)),
    attempts: onRuns.length,
  };
}
