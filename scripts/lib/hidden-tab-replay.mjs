export const HIDDEN_TAB_REPLAY_SIGNATURE = 'TALARIA_HIDDEN_TAB_REPLAY_V1';
export const HIDDEN_TAB_REPLAY_STATUS_SKIP = 'SKIP';

export function forceDocumentHidden(doc, hidden = true) {
  if (!doc) throw new Error('document required');
  try {
    Object.defineProperty(doc, 'hidden', {
      configurable: true,
      enumerable: true,
      get: () => !!hidden,
    });
  } catch (_) {
    try { doc.hidden = !!hidden; } catch (_) { /* ignore */ }
  }
  try {
    Object.defineProperty(doc, 'visibilityState', {
      configurable: true,
      enumerable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
  } catch (_) { /* ignore */ }
  try {
    doc.dispatchEvent(new Event('visibilitychange'));
  } catch (_) { /* ignore */ }
  return {
    hidden: !!doc.hidden,
    visibilityState: String(doc.visibilityState || ''),
  };
}

export function readReplayPlayhead(rs) {
  if (!rs || typeof rs !== 'object') return null;
  return {
    isActive: !!rs.isActive,
    isPlaying: !!rs.isPlaying,
    currentIndex: Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
    replayTimestamp: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
  };
}

export function playheadAdvanced(before, after) {
  if (!before || !after) return { advanced: false, reason: 'missing playhead' };
  const indexDelta = (after.currentIndex ?? 0) - (before.currentIndex ?? 0);
  const tsDelta = (after.replayTimestamp ?? 0) - (before.replayTimestamp ?? 0);
  const advanced = indexDelta > 0 || tsDelta > 0;
  return { advanced, indexDelta, tsDelta };
}

/**
 * Cell semantics (GATE-01):
 * HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE passes only when the playhead did NOT
 * advance while document.hidden was forced true. Today's product has zero
 * visibility handling → advance → cell RED. If this cell is GREEN on unfixed
 * code, the gate is wrong.
 */
export function assertHiddenTabReplayCells({ before, after, hiddenState, mutant = false } = {}) {
  const delta = playheadAdvanced(before, after);
  const cells = [
    {
      name: 'HIDDEN-TAB-DOCUMENT-FORCED-HIDDEN',
      blocking: true,
      pass: !!(hiddenState && hiddenState.hidden === true),
      detail: `hidden=${hiddenState?.hidden}; visibilityState=${hiddenState?.visibilityState}`,
    },
    {
      name: 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE',
      blocking: true,
      pass: delta.advanced === false && before?.isPlaying === true,
      detail: `wasPlaying=${before?.isPlaying}; indexDelta=${delta.indexDelta}; tsDelta=${delta.tsDelta}; advanced=${delta.advanced}`,
    },
  ];

  if (mutant) {
    // Mutant serves a pause-on-hidden shim; acceptance cells must go GREEN under it
    // only as a positive control — NC requires the unfixed/product arm stays RED.
    const pauseCell = cells.find((c) => c.name === 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE');
    cells.push({
      name: 'NC-HIDDEN-TAB-PAUSE-SHIM',
      blocking: true,
      pass: pauseCell?.pass === true,
      detail: `shimMustPause=${pauseCell?.pass}; ${pauseCell?.detail}`,
    });
  }

  return cells;
}
