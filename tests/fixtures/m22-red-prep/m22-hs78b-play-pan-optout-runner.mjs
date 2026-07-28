/**
 * M22 / H-S78B — real multichart product/browser RED runner (dual-tree).
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 * Imports harness serve.mjs + harness-lib.mjs by path — no edits to harness files.
 *
 *   node "chart v 1.4/chart/modules/m22-hs78b-play-pan-optout-runner.mjs"
 *   M22_HS78B_WRITE_EVIDENCE=1 node "chart v 1.4/chart/modules/m22-hs78b-play-pan-optout-runner.mjs"
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  M22_HS78B_GESTURE_MATRIX,
  M22_HS78B_SCENARIO,
  M22_HS78B_STATUS,
} from './m22-hs78b-play-pan-optout-contract.mjs';
import {
  bootCleanReplayPlaySession,
  panIntentWhilePlaying,
} from './m22-hs78b-harness-shim.mjs';
import {
  buildDependencyPinlock,
  hashFileSha256,
  resolveDualTree,
} from './m22-hs78b-dual-tree-root.mjs';
import {
  evaluateHs78bObservation,
  ORACLE_EXIT,
  serializeHandoff,
} from './m22-hs78b-play-pan-optout-oracle.mjs';
import { writeHs78bEvidenceJson } from './m22-hs78b-play-pan-optout-evidence-io.mjs';

const HEADFUL = process.env.M22_HS78B_HEADFUL === '1';
const CELL_FILTER = process.env.M22_HS78B_CELL || null;

async function importHarness(tree) {
  const serveHref = pathToFileURL(tree.serveMjs).href;
  const libHref = pathToFileURL(tree.harnessLibMjs).href;
  const [serveMod, libMod] = await Promise.all([
    import(serveHref),
    import(libHref),
  ]);
  return { serveMod, libMod };
}

async function runGestureCell(page, lib, boot, gesture, startTs) {
  const ctx = {
    panelFrameMap: lib.panelFrameMap,
    hostReplaySeek: lib.hostReplaySeek,
    broadcastCmd: lib.broadcastCmd,
    sleep: lib.sleep,
    startTs,
  };
  const result = await panIntentWhilePlaying(
    page,
    M22_HS78B_SCENARIO.panel,
    gesture.cssDevicePx,
    ctx,
  );
  return {
    meta: {
      cellId: gesture.cellId,
      cssDevicePx: gesture.cssDevicePx,
      role: gesture.role,
      underCommitThreshold: gesture.underCommitThreshold,
      pointerEvents: gesture.pointerEvents,
    },
    probe: result.probe,
    snapshots: result.snapshots,
    tsEnd: result.ts,
  };
}

/**
 * @param {ReturnType<typeof resolveDualTree>['trees'][string]} tree
 */
async function runTreeCell(tree) {
  const chartJsSha256 = hashFileSha256(tree.chartJs);
  let srv;
  let browser;
  try {
    const { serveMod, libMod } = await importHarness(tree);
    srv = await serveMod.startServer(0);
    browser = await libMod.launchBrowser({ headful: HEADFUL });

    const boot = await libMod.bootLayout(browser, srv, {
      pair: M22_HS78B_SCENARIO.boot.pair,
      panels: M22_HS78B_SCENARIO.boot.panels,
      tf: M22_HS78B_SCENARIO.boot.tf,
    });

    const { page } = boot;
    const session = await bootCleanReplayPlaySession(page, libMod, {
      getInFlightDataRequests: boot.getInFlightDataRequests,
    });

    if (!session.ok) {
      await boot.close();
      return {
        treeKey: tree.key,
        chartJsSha256,
        relChartRoot: tree.relChartRoot,
        setupError: session.reason || 'follow not engaged',
      };
    }

    const gestures = CELL_FILTER
      ? M22_HS78B_GESTURE_MATRIX.filter((g) => g.cellId === CELL_FILTER)
      : M22_HS78B_GESTURE_MATRIX;

    const cells = [];
    for (const gesture of gestures) {
      // Fresh boot per gesture cell — no prior large drag contamination.
      // eslint-disable-next-line no-await-in-loop
      await boot.close();
      // eslint-disable-next-line no-await-in-loop
      const bootCell = await libMod.bootLayout(browser, srv, {
        pair: M22_HS78B_SCENARIO.boot.pair,
        panels: M22_HS78B_SCENARIO.boot.panels,
        tf: M22_HS78B_SCENARIO.boot.tf,
      });
      // eslint-disable-next-line no-await-in-loop
      const sess = await bootCleanReplayPlaySession(bootCell.page, libMod, {
        getInFlightDataRequests: bootCell.getInFlightDataRequests,
      });
      if (!sess.ok) {
        cells.push({
          meta: {
            cellId: gesture.cellId,
            cssDevicePx: gesture.cssDevicePx,
            role: gesture.role,
            underCommitThreshold: gesture.underCommitThreshold,
          },
          setupError: sess.reason,
          probe: { chartEvents: [], actualMovementCssPx: 0 },
          snapshots: {},
        });
        // eslint-disable-next-line no-await-in-loop
        await bootCell.close();
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const cell = await runGestureCell(bootCell.page, libMod, bootCell, gesture, sess.ts);
      cells.push(cell);
      // eslint-disable-next-line no-await-in-loop
      await bootCell.close();
    }

    return {
      treeKey: tree.key,
      chartJsSha256,
      relChartRoot: tree.relChartRoot,
      preGesture: {
        followEngaged: session.followEngaged,
        bBefore: session.bBefore,
      },
      cells,
    };
  } catch (err) {
    return {
      treeKey: tree.key,
      chartJsSha256,
      setupError: String((err && err.stack) || err),
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv) await srv.close().catch(() => {});
  }
}

export async function runM22Hs78bRedLane(opts = {}) {
  const dual = resolveDualTree();
  const pinlock = buildDependencyPinlock();
  const treeKeys = opts.trees || ['v14', 'homepage'];
  const trees = [];

  for (const key of treeKeys) {
    const tree = dual.trees[key];
    if (!tree) continue;
    // eslint-disable-next-line no-await-in-loop
    const cell = await runTreeCell(tree);
    trees.push(cell);
  }

  const evalResult = evaluateHs78bObservation({ trees, pinlock });
  const handoff = serializeHandoff(evalResult, {
    status: M22_HS78B_STATUS,
    headful: HEADFUL,
    cellFilter: CELL_FILTER,
    treeKeys,
    gestureMatrix: M22_HS78B_GESTURE_MATRIX.map((g) => ({
      cellId: g.cellId,
      cssDevicePx: g.cssDevicePx,
      role: g.role,
    })),
  });

  // Enrich handoff with full measurement detail for worker serialization
  handoff.measurements = trees.map((t) => ({
    treeKey: t.treeKey,
    chartJsSha256: t.chartJsSha256,
    preGesture: t.preGesture,
    cells: (t.cells || []).map((c) => ({
      cellId: c.meta?.cellId,
      cssDevicePx: c.meta?.cssDevicePx,
      declaredCssDevicePx: c.probe?.declaredCssDevicePx,
      dpr: c.probe?.dpr,
      layoutZoom: c.probe?.layoutZoom,
      panCommitThresholdPx: c.probe?.panCommitThresholdPx,
      actualMovementCssPx: c.probe?.actualMovementCssPx,
      chartEventCount: c.probe?.chartEvents?.length ?? 0,
      pointerEvents: c.meta?.pointerEvents,
      before: c.snapshots?.before,
      immediate: c.snapshots?.immediate,
      post50: c.snapshots?.post50,
      followRendersDeltaImmediate: c.snapshots?.followRendersDeltaImmediate,
      followRendersDeltaPost50: c.snapshots?.followRendersDeltaPost50,
      offsetToTargetImmediate: c.snapshots?.offsetToTargetImmediate,
      offsetToTargetPost50: c.snapshots?.offsetToTargetPost50,
      recenters: c.snapshots?.recenters,
      probeVacuity: {
        eventTypes: [...new Set((c.probe?.chartEvents || []).map((e) => e.type))],
        panBranch: !!(c.probe?.dragDuring?.type === 'pan'),
      },
    })),
  }));

  const evidencePayload = {
    ...handoff,
    pinlock,
    separation: {
      metaTestPass: evalResult.metaTestShouldPass,
      productRed: evalResult.verdict === 'PRODUCT-RED-CONFIRMED',
      productBlocked: evalResult.verdict === 'BLOCKED-RED',
      productGreen: false,
      note: 'Meta-test PASS means oracle confirmed known defect; product remains RED.',
    },
  };

  const writeResult = writeHs78bEvidenceJson(
    dual.root,
    'docs/plan3/evidence/M22-H-S78B-PLAY-PAN-OPTOUT-RED.PRELIMINARY.json',
    evidencePayload,
    {
      force: opts.writeEvidence,
      sourcePaths: [
        path.join(dual.moduleDir.abs, 'm22-hs78b-play-pan-optout-contract.mjs'),
        path.join(dual.moduleDir.abs, 'm22-hs78b-play-pan-optout-oracle.mjs'),
        path.join(dual.moduleDir.abs, 'm22-hs78b-play-pan-optout-runner.mjs'),
        path.join(dual.moduleDir.abs, 'm22-hs78b-harness-shim.mjs'),
        dual.trees.v14.chartJs,
        dual.trees.homepage.chartJs,
        dual.trees.v14.harnessLibMjs,
        dual.trees.v14.serveMjs,
      ],
    },
  );

  return {
    evalResult,
    handoff,
    writeResult,
    pinlock,
  };
}

async function main() {
  const result = await runM22Hs78bRedLane({
    writeEvidence: process.env.M22_HS78B_WRITE_EVIDENCE === '1',
  });
  const { evalResult, handoff, writeResult } = result;

  console.log(JSON.stringify(handoff, null, 2));
  if (writeResult?.written) {
    console.error(`[m22-hs78b] evidence written: ${writeResult.abs} sha256=${writeResult.contentSha256}`);
  } else if (writeResult?.skipped) {
    console.error(`[m22-hs78b] evidence skipped: ${writeResult.reason}`);
  }

  console.error(`[m22-hs78b] verdict=${evalResult.verdict} exit=${evalResult.exitCode} metaPass=${evalResult.metaTestShouldPass}`);

  for (const t of evalResult.treeResults || []) {
    if (t.setupError) {
      console.error(`[m22-hs78b] ${t.treeKey} SETUP-FAIL: ${t.setupError}`);
      continue;
    }
    for (const c of t.cellEvals || []) {
      console.error(
        `[m22-hs78b] ${t.treeKey} ${c.cellId} ${c.verdict} `
        + `uHP=${c.userHasPannedImmediate} auto=${c.autoScrollEnabledImmediate} `
        + `followΔ50=${c.followRendersDeltaPost50} oTT ${c.offsetToTargetImmediate}->${c.offsetToTargetPost50}`,
      );
    }
  }

  process.exit(evalResult.exitCode);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('[m22-hs78b] FATAL', err);
    process.exit(ORACLE_EXIT.SETUP_FAIL);
  });
}
