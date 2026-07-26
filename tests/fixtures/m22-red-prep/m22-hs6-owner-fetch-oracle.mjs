/**
 * M22 / H-S6 — owner-fetch oracle (pure evaluation; no browser).
 * RED-PREP-ONLY-M21-1-LOCKED
 */
import {
  M22_HS6_GREEN_INVARIANTS,
  M22_HS6_RED_SIGNATURE,
  M22_HS6_SCENARIO,
  M22_HS6_STATUS,
  countTargetTfDataRequests,
  countEndpointTfRequests,
  panelFetchDeltas,
  panelsThatFetched,
  totalDataFetches,
} from './m22-hs6-owner-fetch-contract.mjs';

export const ORACLE_EXIT = Object.freeze({
  GREEN: 0,
  RED_PRODUCT: 11,
  RED_UNEXPECTED: 12,
  SETUP_FAIL: 2,
});

/**
 * @param {object} step
 * @param {'1m_to_1h'|'1h_to_1m'} phase
 */
export function evaluateFanOutStep(step, phase) {
  const ids = M22_HS6_SCENARIO.panels;
  const fetched = panelsThatFetched(step.before, step.after, ids);
  const deltas = panelFetchDeltas(step.before, step.after, ids);
  const apiLog = step.apiLog || [];
  const inv = phase === '1m_to_1h'
    ? M22_HS6_GREEN_INVARIANTS.fanOut1mTo1h
    : M22_HS6_GREEN_INVARIANTS.fanOut1hTo1mCached;

  const ownerId = inv.ownerPanelId || 'A';
  const ownerFetch = deltas[ownerId] || 0;
  const peerFetchTotal = (inv.peerIds || ['B', 'C', 'D']).reduce(
    (sum, id) => sum + (deltas[id] || 0),
    0,
  );
  const targetTf = inv.targetTf || (phase === '1m_to_1h' ? '1h' : '1m');
  const targetTfRequests = countTargetTfDataRequests(apiLog, targetTf);
  const totalNetwork = totalDataFetches(apiLog);
  const peer1mSmart = countEndpointTfRequests(apiLog, 'file.smart', '1m');
  const target1hNetwork = countTargetTfDataRequests(apiLog, '1h');

  const ownerOk = fetched.filter((id) => id === ownerId).length <= inv.ownerPanelFetchMax
    && ownerFetch <= inv.ownerPanelFetchMax;
  const peersOk = (inv.peerIds || []).every((id) => !fetched.includes(id))
    && peerFetchTotal <= inv.peerFetchMax;
  const networkOk = targetTfRequests <= inv.targetTfNetworkRequests;

  const greenPass = ownerOk && peersOk && networkOk;

  const redSig = phase === '1m_to_1h'
    ? M22_HS6_RED_SIGNATURE.fanOut1mTo1h
    : M22_HS6_RED_SIGNATURE.fanOut1hTo1m;

  let redMatch = false;
  if (phase === '1m_to_1h') {
    const peerSelfOwnCount = step.peerSelfOwn
      ? Object.values(step.peerSelfOwn).filter(Boolean).length
      : 0;
    redMatch = fetched.length >= redSig.minPanelsThatFetched
      && JSON.stringify([...fetched].sort()) === JSON.stringify([...redSig.expectedPanelsThatFetched].sort())
      && target1hNetwork >= redSig.minTargetTf1hNetworkRequests
      && peer1mSmart >= redSig.minPeerFiner1mSmartRequests
      && totalNetwork >= redSig.minTotalDataNetworkRequests
      && peerSelfOwnCount >= redSig.minPeerFinerSelfOwnCount;
  } else {
    redMatch = fetched.length <= (redSig.maxPanelsThatFetched ?? 1);
  }

  return {
    phase,
    greenPass,
    redMatch,
    fetched,
    deltas,
    ownerFetch,
    peerFetchTotal,
    targetTf,
    targetTfRequests,
    target1hNetwork,
    peer1mSmart,
    totalNetwork,
    apiLogLen: apiLog.length,
    peerSelfOwn: step.peerSelfOwn || null,
    checks: { ownerOk, peersOk, networkOk },
  };
}

/**
 * @param {{ trees: object[], pinlock?: object }} observation
 */
export function evaluateHs6Observation(observation) {
  const treeResults = [];
  let anyRedMatch = false;
  let anyGreen = false;
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
    const up = evaluateFanOutStep(tree.fanOut1mTo1h, '1m_to_1h');
    const down = evaluateFanOutStep(tree.fanOut1hTo1m, '1h_to_1m');
    const redMatch = up.redMatch && down.redMatch;
    const greenPass = up.greenPass && down.greenPass;
    if (redMatch) anyRedMatch = true;
    if (greenPass) anyGreen = true;
    treeResults.push({
      treeKey: tree.treeKey,
      chartJsSha256: tree.chartJsSha256,
      fanOut1mTo1h: up,
      fanOut1hTo1m: down,
      redMatch,
      greenPass,
      signature: redMatch ? 'ABCD-4FETCH-STORM' : (greenPass ? 'GREEN' : 'UNEXPECTED'),
    });
  }

  const redTrees = treeResults.filter((t) => t.redMatch);
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
  } else if (anyRedMatch && (treeResults.length === 1 || signatureParity)) {
    verdict = 'PRODUCT-RED-CONFIRMED';
    exitCode = ORACLE_EXIT.RED_PRODUCT;
  } else if (anyRedMatch) {
    verdict = 'PRODUCT-RED-PARITY-MISMATCH';
    exitCode = ORACLE_EXIT.RED_UNEXPECTED;
  } else {
    verdict = 'RED-SIGNATURE-MISS';
    exitCode = ORACLE_EXIT.RED_UNEXPECTED;
  }

  return {
    status: M22_HS6_STATUS,
    verdict,
    exitCode,
    metaTestShouldPass: verdict === 'PRODUCT-RED-CONFIRMED',
    productGreen: false,
    treeResults,
    signatureParity,
    pinlock: observation.pinlock || null,
    evaluatedAt: new Date().toISOString(),
  };
}

export function serializeHandoff(evalResult, runnerMeta = {}) {
  return {
    lane: 'M22-H-S6-OWNER-FETCH',
    status: M22_HS6_STATUS,
    auditRef: 'db9ddd96',
    verdict: evalResult.verdict,
    metaTestShouldPass: evalResult.metaTestShouldPass,
    productGreen: false,
    exitCode: evalResult.exitCode,
    signature: evalResult.treeResults?.[0]?.signature || null,
    dualTreeParity: evalResult.signatureParity,
    trees: evalResult.treeResults?.map((t) => ({
      treeKey: t.treeKey,
      chartJsSha256: t.chartJsSha256,
      fanOut1mTo1h: {
        fetched: t.fanOut1mTo1h?.fetched,
        deltas: t.fanOut1mTo1h?.deltas,
        targetTfRequests: t.fanOut1mTo1h?.targetTfRequests,
        target1hNetwork: t.fanOut1mTo1h?.target1hNetwork,
        peer1mSmart: t.fanOut1mTo1h?.peer1mSmart,
        totalNetwork: t.fanOut1mTo1h?.totalNetwork,
        peerSelfOwn: t.fanOut1mTo1h?.peerSelfOwn,
      },
      fanOut1hTo1m: {
        fetched: t.fanOut1hTo1m?.fetched,
        deltas: t.fanOut1hTo1m?.deltas,
        targetTfRequests: t.fanOut1hTo1m?.targetTfRequests,
      },
    })),
    pinlock: evalResult.pinlock,
    runnerMeta,
    nextWorker: {
      owner: 'M21-1 chart.js',
      killSwitch: '__TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD',
      primaryHunk: '_applyFinerPanelHostCommit',
      greenSuite: 'M22_HS6_REQUIRED_GREEN_SUITE in m22-hs6-owner-fetch-contract.mjs',
      hunkManifest: 'docs/plan3/M22-H-S6-OWNER-FETCH-FUTURE-HUNK-MANIFEST.json',
    },
  };
}
