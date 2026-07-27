export const M23_RED = Object.freeze({
  STEP_BACK_NO_LEDGER_RESTORE: 'RED_STEP_BACK_NO_LEDGER_RESTORE',
  ACTIVE_HANDLE_DRAG_NO_LEDGER_RESTORE: 'RED_ACTIVE_HANDLE_DRAG_NO_LEDGER_RESTORE',
  CUT_RESTORE_MISMATCH: 'RED_CUT_RESTORE_MISMATCH',
});

const stable = (value) => JSON.stringify(value ?? null);

export function snapshotRollbackState(state) {
  return {
    trades: state.trades ?? [],
    history: state.history ?? [],
    balance: state.balance,
    artifacts: state.artifacts ?? [],
    identityCounter: state.identityCounter,
  };
}

export function expectedAtCut(before, cutoff) {
  const keep = (row) => Number(row.exitTime) < cutoff;
  const history = (before.history ?? []).filter(keep);
  const trades = (before.trades ?? []).filter((row) => Number(row.entryTime) < cutoff);
  return {
    trades,
    history,
    balance: Number(before.startingBalance)
      + history.reduce((sum, row) => sum + Number(row.pnl || 0), 0),
    artifacts: (before.artifacts ?? []).filter((row) => Number(row.time) < cutoff),
  };
}

export function classifyRollbackCell(cell) {
  const expected = expectedAtCut(cell.before, cell.cutoff);
  const after = snapshotRollbackState(cell.after);
  const restored = {
    trades: stable(after.trades) === stable(expected.trades),
    history: stable(after.history) === stable(expected.history),
    balance: after.balance === expected.balance,
    artifacts: stable(after.artifacts) === stable(expected.artifacts),
  };
  const exactLedgerRestore = Object.values(restored).every(Boolean);
  const identity = {
    before: cell.before.identityCounter,
    after: after.identityCounter,
    monotonic: Number(after.identityCounter) >= Number(cell.before.identityCounter),
    reused: Number(after.identityCounter) < Number(cell.before.identityCounter),
  };

  let verdict = 'GREEN_EXACT_CUT_RESTORE';
  if (!exactLedgerRestore) {
    if (cell.mechanism === 'replay-step-back') verdict = M23_RED.STEP_BACK_NO_LEDGER_RESTORE;
    else if (cell.mechanism === 'active-replay-handle-drag') {
      verdict = M23_RED.ACTIVE_HANDLE_DRAG_NO_LEDGER_RESTORE;
    } else verdict = M23_RED.CUT_RESTORE_MISMATCH;
  }

  return { verdict, restored, identity, expected };
}

export function summarizeRollbackMechanisms(cells) {
  const classified = cells.map((cell) => ({ ...cell, oracle: classifyRollbackCell(cell) }));
  return {
    verdict: classified.some((cell) => String(cell.oracle.verdict).startsWith('RED_'))
      ? 'RED' : 'GREEN',
    mechanismMapping: {
      replayStepBack: 'requestStepBackward → stepBackward → playhead/chart update only',
      activeReplayHandleDrag: 'pointer drag → seekTo(fromDrag) → playhead/chart update only',
      cleanReplayBarCut: 'applyReplayCutToWallClock → forceCloseAllOrders(cutoff) → ledger reconciliation',
    },
    identityPolicyProposal:
      'PO decision: trade IDs are monotonic audit identities and are never reused after rollback; '
      + 'rollback restores economic state but does not rewind the allocation counter. '
      + 'If PO instead defines IDs as replay-state-local, counter restoration must be specified and tested separately.',
    cells: classified,
  };
}
