/**
 * M22 / H-S78B (BL-16) — replay-playing pan-intent opt-out defect contract.
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 * Audit: 6cb990c8 — legacy H-S78 A9+BL-16 pin is CONFUNDED (700px drag pre-sets
 * userHasPanned before the micro-pan RED cell). This lane isolates gesture-start
 * opt-out without prior large drag.
 *
 * NO edits to chart.js, replay-system.js, scenarios.mjs, known-failing.json,
 * panel/sync bridges, W5/W6, or existing product/tests.
 */

export const M22_HS78B_STATUS = 'RED-PREP-ONLY-M21-1-LOCKED';
export const M22_HS78B_AUDIT_REF = '6cb990c8';

/** Default-ON future fix; true => legacy threshold-only (panCommitted) opt-out. */
export const M22_HS78B_KILL_SWITCH = '__TALARIA_MC_DISABLE_PLAY_PAN_MOUSEDOWN_OPTOUT';

/** Desktop pan-commit slop in chart.js _panCommitThresholdPx (coarse => 14). */
export const M22_HS78B_PAN_COMMIT_THRESHOLD_CSS_PX = 5;

export const M22_HS78B_SCENARIO = Object.freeze({
  id: 'H-S78B',
  legacyScenarioId: 'H-S78',
  title: 'BL-16 replay-playing pan-intent disengage (clean, unconfounded)',
  panel: 'B',
  boot: Object.freeze({
    pair: 'same',
    panels: 4,
    tf: '1m',
    coarsePanelTf: '1h',
    syncOn: false,
    intervalSyncOn: false,
    viewport: Object.freeze({ width: 2600, height: 1400, deviceScaleFactor: 1 }),
  }),
  warmupPlayFrames: 60,
  postGesturePlayFrames: 50,
  playStepMs: 60_000,
});

/**
 * Predeclared gesture matrix — CSS/device pixels at DPR=1, pointer events via
 * puppeteer page.mouse (mousedown → N×mousemove → mouseup) while play frames stream.
 */
export const M22_HS78B_GESTURE_MATRIX = Object.freeze([
  {
    cellId: 'click-0px',
    cssDevicePx: 0,
    pointerEvents: Object.freeze(['mousedown', 'mouseup']),
    role: 'click-control',
    expectFutureOptOut: false,
    expectClickSafe: true,
  },
  {
    cellId: 'pan-intent-1px',
    cssDevicePx: 1,
    pointerEvents: Object.freeze(['mousedown', 'mousemove', 'mouseup']),
    role: 'sub-threshold-primary',
    expectFutureOptOut: true,
    underCommitThreshold: true,
  },
  {
    cellId: 'pan-intent-4px',
    cssDevicePx: 4,
    pointerEvents: Object.freeze(['mousedown', 'mousemove', 'mouseup']),
    role: 'sub-threshold-primary',
    expectFutureOptOut: true,
    underCommitThreshold: true,
  },
  {
    cellId: 'pan-intent-5px',
    cssDevicePx: 5,
    pointerEvents: Object.freeze(['mousedown', 'mousemove', 'mouseup']),
    role: 'at-threshold',
    expectFutureOptOut: true,
    underCommitThreshold: true,
  },
  {
    cellId: 'pan-intent-6px',
    cssDevicePx: 6,
    pointerEvents: Object.freeze(['mousedown', 'mousemove', 'mouseup']),
    role: 'over-threshold-discriminant',
    expectFutureOptOut: true,
    underCommitThreshold: false,
  },
]);

/** Intended GREEN invariants (future product worker). */
export const M22_HS78B_GREEN_INVARIANTS = Object.freeze({
  replayPlayingPanIntent: Object.freeze({
    userHasPanned: true,
    autoScrollEnabled: false,
    followRendersDeltaPostGesture: 0,
    noRecenterAfterMovement: true,
    distinguishesClickFromPan: true,
  }),
  clickControl: Object.freeze({
    userHasPanned: false,
    autoScrollEnabled: true,
    panCommitted: false,
  }),
});

/** Known RED signature on clean HEAD chart.js (both trees). */
export const M22_HS78B_RED_SIGNATURE = Object.freeze({
  subThresholdPanIntent: Object.freeze({
    userHasPanned: false,
    autoScrollEnabled: true,
    followRendersDeltaPostGestureMin: 1,
    optOutHole: true,
    defectClass: 'replay-play-pan-intent-gesture-start-optout-hole',
    rootCause: 'chart.js defers replaySystem.onUserPan until drag.panCommitted crosses _panCommitThresholdPx (5 CSS px desktop); play follow continues during sub-threshold pan-intent',
  }),
  overThresholdDiscriminant: Object.freeze({
    note: 'pan-intent-6px should commit on legacy product — proves threshold-only behavior',
    expectPanCommitted: true,
    expectUserHasPanned: true,
  }),
  confoundedLegacyPin: Object.freeze({
    scenarioId: 'H-S78',
    status: 'STALE-CONFOUNDED-NOT-GREEN',
    reason: 'Prior 700px dragPanelWhileStreaming sets userHasPanned before BL-16 micro-pan cell',
    auditRef: M22_HS78B_AUDIT_REF,
    knownFailingPin: 'H-S78 RED sub-check measures recenter while userHasPanned already true — not gesture-start hole',
  }),
});

export function m22Hs78bPlayPanMousedownOptoutEnabled(scope = globalThis) {
  try {
    return !(scope && scope[M22_HS78B_KILL_SWITCH] === true);
  } catch (_) {
    return true;
  }
}

export function switchOffRestoresLegacyThresholdOnlyOptout(scope = globalThis) {
  return m22Hs78bPlayPanMousedownOptoutEnabled(scope) === false;
}

export function followSlackPx(follow) {
  const sp = follow && Number.isFinite(follow.spacing) && follow.spacing > 0 ? follow.spacing : 8;
  return sp * 3;
}

export const M22_HS78B_REQUIRED_GREEN_SUITE = Object.freeze([
  { id: 'H-S78B', scope: 'clean replay-playing pan-intent opt-out (this lane)' },
  { id: 'click', scope: 'normal chart click — no follow disengage' },
  { id: 'drawing-drag', scope: 'armed draw tool drag must not latch play pan opt-out' },
  { id: 'pinch-touch', scope: 'coarse pointer 14px threshold + touch pan paths' },
  { id: 'selection-measure', scope: 'measure/selection tools' },
  { id: 'replay-paused-pan', scope: 'paused replay pan unchanged' },
  { id: 'replay-playing-pan-1px', scope: 'playing pan at 1 CSS px' },
  { id: 'replay-playing-pan-4px', scope: 'playing pan at 4 CSS px' },
  { id: 'replay-playing-pan-5px', scope: 'playing pan at 5 CSS px (at threshold)' },
  { id: 'replay-playing-pan-6px', scope: 'playing pan at 6 CSS px (over threshold)' },
  { id: 'passive-follower-play', scope: 'idle panel passive play follow' },
  { id: 'four-panels', scope: 'A/B/C/D isolation' },
  { id: 'sync-on-off', scope: 'visible-range + interval sync matrices' },
  { id: 'kill-switch', scope: `${M22_HS78B_KILL_SWITCH}=true restores threshold-only legacy` },
  { id: 'M21-1-follower-drawing-transform', scope: 'follower drawing transform regressions' },
  { id: 'H-S6', scope: 'owner-fetch fan-out' },
  { id: 'Q1-Q2-Q8', scope: 'multichart ownership matrix' },
  { id: 'D-038', scope: 'BL-11 playhead cadence' },
]);

export const M22_HS78B_HUNK_MANIFEST = Object.freeze([
  {
    id: 'HS78B-H1',
    file: 'chart v 1.4/chart/chart.js',
    title: 'Kill-switch accessor + replay-playing pan-intent latch predicate',
    anchors: ['_panCommitThresholdPx (~L27309)', 'chart pan mousedown (~L35631)', 'pan mousemove commit (~L35721)'],
    change: [
      `Add _m22Hs78bPlayPanMousedownOptoutEnabled() reading ${M22_HS78B_KILL_SWITCH} (default ON when unset)`,
      'Add _m22Hs78bShouldLatchReplayPanOptout(detail) — true when replaySystem.isActive && replaySystem.isPlaying && drag.type===pan && first nonzero pan-intent movement (commitDx/commitDy > 0, not yet panCommitted)',
      'Do NOT latch on mousedown alone unless click-control evidence proves safe',
    ],
  },
  {
    id: 'HS78B-H2',
    file: 'chart v 1.4/chart/chart.js',
    title: 'Latch replaySystem.onUserPan at first pan-intent movement during play',
    anchors: ['pan mousemove (~L35715–35745)'],
    change: [
      'Before panCommitted threshold check: if optout guard enabled && _m22Hs78bShouldLatchReplayPanOptout, call replaySystem.onUserPan() once per gesture',
      'Preserve existing panCommitted threshold for offsetX paint / click discrimination',
      'Kill path (switch ON): skip early latch — restore today threshold-only onUserPan',
    ],
  },
  {
    id: 'HS78B-H3',
    file: 'chart v 1.4/chart/modules/replay-system.js',
    title: 'Optional thin replay helper (only if chart.js latch needs shared state)',
    anchors: ['onUserPan (~L7064)'],
    change: [
      'Optional: _noteReplayPlayPanIntentLatched() idempotent guard if double-fire risk',
      'Skip if chart.js inline latch is sufficient',
    ],
    optional: true,
  },
  {
    id: 'HS78B-H4',
    file: 'homepage/public/chart/chart.js',
    title: 'Dual-tree byte-identical mirror of H1–H2',
    anchors: ['same symbols'],
    change: ['Mirror after v14 GREEN'],
  },
  {
    id: 'HS78B-H5',
    file: 'chart v 1.4/chart/modules/m22-hs78b-play-pan-optout.red.test.mjs',
    title: 'Flip meta+oracle RED→GREEN; kill-switch discrimination cell',
    anchors: ['this prep lane'],
    change: [
      'Product oracle exits 0 on both trees when latch lands',
      'Legacy switch-ON cell reproduces sub-threshold opt-out hole',
      'Write docs/plan3/evidence/M22-H-S78B-PLAY-PAN-OPTOUT-GREEN.json',
    ],
  },
]);

export const M22_HS78B_FORBIDDEN_EDITS = Object.freeze([
  'chart v 1.4/chart/chart.js (until M21-1 releases)',
  'homepage/public/chart/chart.js (until M21-1 releases)',
  'chart v 1.4/chart/modules/replay-system.js (until M21-1 releases)',
  'chart v 1.4/chart/multichart-prod/harness/scenarios.mjs',
  'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js',
  'chart v 1.4/chart/multichart-prod/sync-bridge.js',
  'known-failing.json',
  'W5/W6 fixtures and existing product/tests',
]);

/** Non-vacuity: real chart received pointer stream + pan branch or viewport delta. */
export function probeNonVacuity(probe, declaredCssPx) {
  const events = probe?.chartEvents || [];
  const hasDown = events.some((e) => e.type === 'mousedown');
  const hasMove = declaredCssPx === 0 || events.some((e) => e.type === 'mousemove');
  const drag = probe?.dragDuring || {};
  const panBranch = drag.type === 'pan' && (drag.active === true || drag.panCommitted != null);
  const movedCss = Number.isFinite(probe?.actualMovementCssPx) ? probe.actualMovementCssPx : 0;
  const offsetDelta = Number.isFinite(probe?.offsetXDeltaImmediate)
    ? Math.abs(probe.offsetXDeltaImmediate) : 0;
  const viewportMoved = movedCss > 0.01 || offsetDelta > 0.01;
  const eventsReached = hasDown && hasMove;
  return {
    ok: eventsReached && (panBranch || viewportMoved),
    eventsReached,
    panBranch,
    viewportMoved,
    hasDown,
    hasMove,
  };
}
