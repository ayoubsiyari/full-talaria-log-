/**
 * M22 / H-S78B — replay-playing pan-intent opt-out oracle (pure evaluation).
 * RED-PREP-ONLY-M21-1-LOCKED
 */
import {
  M22_HS78B_GREEN_INVARIANTS,
  M22_HS78B_RED_SIGNATURE,
  M22_HS78B_STATUS,
  followSlackPx,
  probeNonVacuity,
} from './m22-hs78b-play-pan-optout-contract.mjs';

export const ORACLE_EXIT = Object.freeze({
  GREEN: 0,
  RED_PRODUCT: 11,
  RED_BLOCKED: 13,
  RED_UNEXPECTED: 12,
  SETUP_FAIL: 2,
});

/**
 * @param {object} cell — one gesture cell result
 */
export function evaluateGestureCell(cell) {
  const { cellId, cssDevicePx, role, underCommitThreshold } = cell.meta || {};
  const vacuity = probeNonVacuity(cell.probe, cssDevicePx);
  const snap = cell.snapshots || {};
  const imm = snap.immediate || {};
  const post = snap.post50 || {};
  const before = snap.before || {};

  if (!vacuity.ok) {
    return {
      cellId,
      role,
      vacuity,
      verdict: 'BLOCKED-RED',
      blocked: true,
      redMatch: false,
      greenPass: false,
    };
  }

  if (role === 'click-control') {
    const clickOk = !imm.userHasPanned
      && imm.autoScrollEnabled !== false
      && imm.drag?.panCommitted !== true;
    return {
      cellId,
      role,
      vacuity,
      verdict: clickOk ? 'CLICK-CONTROL-OK' : 'CLICK-CONTROL-FAIL',
      blocked: false,
      redMatch: false,
      greenPass: clickOk,
      clickSafe: clickOk,
      userHasPanned: imm.userHasPanned,
      autoScrollEnabled: imm.autoScrollEnabled,
      panCommitted: imm.drag?.panCommitted,
    };
  }

  if (role === 'over-threshold-discriminant') {
    const committed = imm.drag?.panCommitted === true || imm.userHasPanned === true;
    return {
      cellId,
      role,
      vacuity,
      verdict: committed ? 'THRESHOLD-DISCRIMINANT-LEGACY' : 'THRESHOLD-DISCRIMINANT-UNEXPECTED',
      blocked: false,
      redMatch: false,
      greenPass: false,
      legacyThresholdOnly: committed,
      userHasPanned: imm.userHasPanned,
      panCommitted: imm.drag?.panCommitted,
    };
  }

  // Sub-threshold pan-intent — primary RED cell
  const redSig = M22_HS78B_RED_SIGNATURE.subThresholdPanIntent;
  const followDelta = Number(snap.followRendersDeltaPost50) || 0;
  const optOutHole = imm.userHasPanned !== true
    && imm.autoScrollEnabled !== false
    && followDelta >= redSig.followRendersDeltaPostGestureMin;
  const recenters = snap.recenters === true
    || (
      Number.isFinite(snap.offsetToTargetImmediate)
      && Number.isFinite(snap.offsetToTargetPost50)
      && snap.offsetToTargetPost50 < snap.offsetToTargetImmediate * 0.85
    );
  const stillFollowing = Number.isFinite(snap.offsetToTargetPost50)
    && snap.offsetToTargetPost50 <= followSlackPx(post) * 2;

  const redMatch = underCommitThreshold !== false
    && optOutHole
    && (recenters || stillFollowing);

  const greenPass = imm.userHasPanned === true
    && imm.autoScrollEnabled === false
    && followDelta === 0
    && !recenters;

  let verdict;
  if (greenPass) verdict = 'UNEXPECTED-GREEN';
  else if (redMatch) verdict = 'PRODUCT-RED-OPTOUT-HOLE';
  else if (optOutHole) verdict = 'PRODUCT-RED-PARTIAL';
  else verdict = 'UNEXPECTED-SIGNATURE';

  return {
    cellId,
    role,
    cssDevicePx,
    vacuity,
    verdict,
    blocked: false,
    redMatch,
    greenPass,
    optOutHole,
    recenters,
    stillFollowing,
    followRendersDeltaPost50: followDelta,
    userHasPannedImmediate: imm.userHasPanned,
    autoScrollEnabledImmediate: imm.autoScrollEnabled,
    panCommittedImmediate: imm.drag?.panCommitted,
    offsetToTargetImmediate: snap.offsetToTargetImmediate,
    offsetToTargetPost50: snap.offsetToTargetPost50,
    offsetXImmediate: imm.offsetX,
    offsetXPost50: post.offsetX,
    followEngagedBefore: snap.followEngagedBefore,
  };
}

/**
 * @param {{ trees: object[], pinlock?: object }} observation
 */
export function evaluateHs78bObservation(observation) {
  const treeResults = [];
  let anyPrimaryRed = false;
  let anyGreen = false;
  let anyBlocked = false;
  let allSetupOk = true;

  for (const tree of observation.trees || []) {
    if (tree.setupError) {
      allSetupOk = false;
      treeResults.push({
        treeKey: tree.treeKey,
        setupError: tree.setupError,
        pass: false,
      });
      continue;
    }

    const cellEvals = (tree.cells || []).map((c) => evaluateGestureCell(c));
    const primary = cellEvals.filter((c) => c.role === 'sub-threshold-primary');
    const primaryRed = primary.some((c) => c.redMatch && !c.blocked);
    const primaryBlocked = primary.some((c) => c.blocked);
    const unexpectedGreen = cellEvals.some((c) => c.greenPass);
    const clickOk = cellEvals.find((c) => c.role === 'click-control')?.clickSafe !== false;

    if (primaryRed) anyPrimaryRed = true;
    if (unexpectedGreen) anyGreen = true;
    if (primaryBlocked && !primaryRed) anyBlocked = true;

    treeResults.push({
      treeKey: tree.treeKey,
      chartJsSha256: tree.chartJsSha256,
      cellEvals,
      primaryRed,
      primaryBlocked,
      clickOk,
      unexpectedGreen,
      signature: primaryRed ? 'PLAY-PAN-OPTOUT-HOLE' : (primaryBlocked ? 'BLOCKED-RED' : 'NO-RED'),
    });
  }

  const redTrees = treeResults.filter((t) => t.primaryRed);
  const signatures = redTrees.map((t) => t.signature);
  const signatureParity = redTrees.length >= 2
    && signatures.every((s) => s === signatures[0]);

  let verdict;
  let exitCode;
  if (!allSetupOk) {
    verdict = 'SETUP-FAIL';
    exitCode = ORACLE_EXIT.SETUP_FAIL;
  } else if (anyGreen) {
    verdict = 'UNEXPECTED-GREEN';
    exitCode = ORACLE_EXIT.RED_UNEXPECTED;
  } else if (anyPrimaryRed && (treeResults.length === 1 || signatureParity)) {
    verdict = 'PRODUCT-RED-CONFIRMED';
    exitCode = ORACLE_EXIT.RED_PRODUCT;
  } else if (anyBlocked && !anyPrimaryRed) {
    verdict = 'BLOCKED-RED';
    exitCode = ORACLE_EXIT.RED_BLOCKED;
  } else if (anyPrimaryRed) {
    verdict = 'PRODUCT-RED-PARITY-MISMATCH';
    exitCode = ORACLE_EXIT.RED_UNEXPECTED;
  } else {
    verdict = 'RED-SIGNATURE-MISS';
    exitCode = ORACLE_EXIT.RED_UNEXPECTED;
  }

  return {
    status: M22_HS78B_STATUS,
    verdict,
    exitCode,
    metaTestShouldPass: verdict === 'PRODUCT-RED-CONFIRMED',
    productGreen: false,
    treeResults,
    signatureParity,
    confoundedLegacy: M22_HS78B_RED_SIGNATURE.confoundedLegacyPin,
    greenModel: M22_HS78B_GREEN_INVARIANTS,
    pinlock: observation.pinlock || null,
    evaluatedAt: new Date().toISOString(),
  };
}

export function serializeHandoff(evalResult, runnerMeta = {}) {
  return {
    lane: 'M22-H-S78B-PLAY-PAN-OPTOUT',
    status: M22_HS78B_STATUS,
    auditRef: '6cb990c8',
    verdict: evalResult.verdict,
    metaTestShouldPass: evalResult.metaTestShouldPass,
    productGreen: false,
    exitCode: evalResult.exitCode,
    signature: evalResult.treeResults?.[0]?.signature || null,
    dualTreeParity: evalResult.signatureParity,
    confoundedLegacyPin: evalResult.confoundedLegacy,
    trees: evalResult.treeResults?.map((t) => ({
      treeKey: t.treeKey,
      chartJsSha256: t.chartJsSha256,
      signature: t.signature,
      cells: t.cellEvals?.map((c) => ({
        cellId: c.cellId,
        role: c.role,
        verdict: c.verdict,
        vacuityOk: c.vacuity?.ok,
        userHasPannedImmediate: c.userHasPannedImmediate,
        autoScrollEnabledImmediate: c.autoScrollEnabledImmediate,
        panCommittedImmediate: c.panCommittedImmediate,
        followRendersDeltaPost50: c.followRendersDeltaPost50,
        offsetToTargetImmediate: c.offsetToTargetImmediate,
        offsetToTargetPost50: c.offsetToTargetPost50,
        offsetXImmediate: c.offsetXImmediate,
        offsetXPost50: c.offsetXPost50,
        actualMovementCssPx: c.vacuity ? undefined : undefined,
      })),
    })),
    pinlock: evalResult.pinlock,
    runnerMeta,
    nextWorker: {
      owner: 'M21-1 chart.js',
      killSwitch: '__TALARIA_MC_DISABLE_PLAY_PAN_MOUSEDOWN_OPTOUT',
      primaryHunk: 'chart.js pan mousemove first pan-intent latch during replay play',
      greenSuite: 'M22_HS78B_REQUIRED_GREEN_SUITE in m22-hs78b-play-pan-optout-contract.mjs',
      hunkManifest: 'docs/plan3/M22-H-S78B-PLAY-PAN-OPTOUT-FUTURE-HUNK-MANIFEST.json',
      'legacyH-S78': 'STALE-CONFOUNDED — do not treat known-failing H-S78 RED pin as gesture-start evidence',
    },
  };
}
