/**
 * M22 / H-S6 — real multichart product/browser RED runner (dual-tree).
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 * Imports harness serve.mjs + harness-lib.mjs by path — no edits to harness files.
 *
 *   node "chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs"
 *   M22_HS6_WRITE_EVIDENCE=1 node "chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs"
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  M22_HS6_HANDOFF_MARKER,
  M22_HS6_KILL_SWITCH,
  M22_HS6_SCENARIO,
  M22_HS6_STATUS,
  panelsThatFetched,
} from './m22-hs6-owner-fetch-contract.mjs';
import {
  buildDependencyPinlock,
  hashFileSha256,
  resolveDualTree,
} from './m22-hs6-dual-tree-root.mjs';
import {
  evaluateHs6Observation,
  ORACLE_EXIT,
  serializeHandoff,
} from './m22-hs6-owner-fetch-oracle.mjs';
import { writeHs6EvidenceJson } from './m22-hs6-owner-fetch-evidence-io.mjs';

const SETTLE_MS = Number(process.env.M22_HS6_SETTLE_MS) || 2500;
const HEADFUL = process.env.M22_HS6_HEADFUL === '1';

async function importHarness(tree) {
  const serveHref = pathToFileURL(tree.serveMjs).href;
  const libHref = pathToFileURL(tree.harnessLibMjs).href;
  const [serveMod, libMod] = await Promise.all([
    import(serveHref),
    import(libHref),
  ]);
  return { serveMod, libMod };
}

async function readPeerSelfOwn(page, lib) {
  const ids = ['B', 'C', 'D'];
  const hostSnap = await page.evaluate(() => ({
    selfOwn: !!(window.chart && window.chart._mcFinerPanelSelfOwner),
    intervalSyncOn: !!(window.chart && window.chart._mcIntervalSyncOn),
    tf: window.chart?.currentTimeframe != null ? String(window.chart.currentTimeframe) : '',
    fetches: window.chart?._mcDiag?.fetches ?? 0,
  }));
  const out = { A: hostSnap.selfOwn };
  const map = lib.panelFrameMap(page);
  for (const id of ids) {
    const frame = map[id];
    if (!frame) {
      out[id] = null;
      continue;
    }
    out[id] = await frame.evaluate(() => !!(window.chart && window.chart._mcFinerPanelSelfOwner)).catch(() => null);
  }
  return {
    peerSelfOwn: out,
    hostIntervalSyncOn: hostSnap.intervalSyncOn,
    hostTf: hostSnap.tf,
    hostFetches: hostSnap.fetches,
  };
}

async function readNetworkInitiators(page, apiLog) {
  const rows = await page.evaluate(() => {
    if (typeof window.__mcDiagReport !== 'function') return [];
    return window.__mcDiagReport();
  }).catch(() => []);
  const byPanel = {};
  for (const row of rows || []) {
    const id = row?.panelId === 'HOST' ? 'A' : String(row?.panelId || '');
    if (!id) continue;
    byPanel[id] = {
      fetches: Number(row.fetches) || 0,
      ownerFetches: Number(row.ownerFetches) || 0,
      handovers: Number(row.handovers) || 0,
    };
  }
  return {
    diagRows: rows,
    byPanel,
    apiLog: (apiLog || []).map((e) => ({
      ts: e.ts,
      endpoint: e.endpoint,
      fileId: e.fileId,
      query: e.query,
    })),
  };
}

/**
 * Execute H-S6 fan-out steps on one product tree via real harness boot path.
 * @param {import('./m22-hs6-dual-tree-root.mjs').resolveDualTree extends Function ? ReturnType<import('./m22-hs6-dual-tree-root.mjs').resolveDualTree>['trees'][string] : any} tree
 */
async function runTreeCell(tree, opts = {}) {
  const chartJsSha256 = hashFileSha256(tree.chartJs);
  let srv;
  let browser;
  try {
    const { serveMod, libMod } = await importHarness(tree);
    const {
      bootLayout,
      fanOutTf,
      launchBrowser,
      readPanels,
      resetDiag,
      setSync,
      sleep,
    } = libMod;

    srv = await serveMod.startServer(0);
    browser = await libMod.launchBrowser({ headful: HEADFUL });

    const preDocument = opts.killSwitchOn
      ? {
        fn: (flag) => { window[flag] = true; },
        args: [M22_HS6_KILL_SWITCH],
      }
      : null;

    const boot = await bootLayout(browser, srv, {
      pair: M22_HS6_SCENARIO.boot.pair,
      panels: M22_HS6_SCENARIO.boot.panels,
      tf: M22_HS6_SCENARIO.boot.tf,
      preDocument,
    });

    const { page } = boot;
    const ids = [...M22_HS6_SCENARIO.panels];

    await setSync(page, true);
    await sleep(300);

    // Step 1: 1m → 1h host interval fan-out
    srv.resetApiLog();
    await resetDiag(page);
    const beforeH = await readPanels(page);
    await fanOutTf(page, '1h');
    await sleep(SETTLE_MS);
    const afterH = await readPanels(page);
    const apiLogH = srv.getApiLog();
    const selfOwnH = await readPeerSelfOwn(page, libMod);
    const networkH = await readNetworkInitiators(page, apiLogH);

    // Step 2: 1h → 1m (cached 1m)
    srv.resetApiLog();
    await resetDiag(page);
    const beforeM = await readPanels(page);
    await fanOutTf(page, '1m');
    await sleep(SETTLE_MS);
    const afterM = await readPanels(page);
    const apiLogM = srv.getApiLog();
    const networkM = await readNetworkInitiators(page, apiLogM);

    await boot.close();

    return {
      treeKey: tree.key,
      chartJsSha256,
      relChartRoot: tree.relChartRoot,
      fanOut1mTo1h: {
        before: beforeH,
        after: afterH,
        fetched: panelsThatFetched(beforeH, afterH, ids),
        apiLog: apiLogH,
        peerSelfOwn: selfOwnH.peerSelfOwn,
        hostIntervalSyncOn: selfOwnH.hostIntervalSyncOn,
        network: networkH,
      },
      fanOut1hTo1m: {
        before: beforeM,
        after: afterM,
        fetched: panelsThatFetched(beforeM, afterM, ids),
        apiLog: apiLogM,
        network: networkM,
      },
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

export async function runM22Hs6RedLane(opts = {}) {
  const dual = resolveDualTree();
  const pinlock = buildDependencyPinlock();
  const treeKeys = opts.trees || ['v14', 'homepage'];
  const trees = [];

  for (const key of treeKeys) {
    const tree = dual.trees[key];
    if (!tree) continue;
    // eslint-disable-next-line no-await-in-loop
    const cell = await runTreeCell(tree, opts);
    trees.push({
      treeKey: cell.treeKey,
      chartJsSha256: cell.chartJsSha256,
      relChartRoot: cell.relChartRoot,
      setupError: cell.setupError || null,
      fanOut1mTo1h: cell.fanOut1mTo1h,
      fanOut1hTo1m: cell.fanOut1hTo1m,
    });
  }

  const evalResult = evaluateHs6Observation({ trees, pinlock });
  const handoff = serializeHandoff(evalResult, {
    status: M22_HS6_STATUS,
    settleMs: SETTLE_MS,
    headful: HEADFUL,
    treeKeys,
  });

  const evidencePayload = {
    ...handoff,
    pinlock,
    separation: {
      metaTestPass: evalResult.metaTestShouldPass,
      productRed: evalResult.verdict === 'PRODUCT-RED-CONFIRMED',
      productGreen: false,
      note: 'Meta-test PASS means oracle confirmed known defect; product remains RED.',
    },
  };

  const writeResult = writeHs6EvidenceJson(
    dual.root,
    'docs/plan3/evidence/M22-H-S6-OWNER-FETCH-RED.PRELIMINARY.json',
    evidencePayload,
    {
      force: opts.writeEvidence,
      sourcePaths: [
        path.join(dual.moduleDir.abs, 'm22-hs6-owner-fetch-contract.mjs'),
        path.join(dual.moduleDir.abs, 'm22-hs6-owner-fetch-oracle.mjs'),
        path.join(dual.moduleDir.abs, 'm22-hs6-owner-fetch-runner.mjs'),
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
  const result = await runM22Hs6RedLane({
    writeEvidence: process.env.M22_HS6_WRITE_EVIDENCE === '1',
  });
  const { evalResult, handoff, writeResult } = result;

  if (writeResult?.written) {
    console.error(`[m22-hs6] evidence written: ${writeResult.abs} sha256=${writeResult.contentSha256}`);
  } else if (writeResult?.skipped) {
    console.error(`[m22-hs6] evidence skipped: ${writeResult.reason}`);
  }

  console.error(`[m22-hs6] verdict=${evalResult.verdict} exit=${evalResult.exitCode} metaPass=${evalResult.metaTestShouldPass}`);

  for (const t of evalResult.treeResults || []) {
    if (t.setupError) {
      console.error(`[m22-hs6] ${t.treeKey} SETUP-FAIL: ${t.setupError}`);
      continue;
    }
    console.error(
      `[m22-hs6] ${t.treeKey} 1m→1h fetched=${JSON.stringify(t.fanOut1mTo1h?.fetched)} `
      + `network1h=${t.fanOut1mTo1h?.target1hNetwork} peer1mSmart=${t.fanOut1mTo1h?.peer1mSmart} `
      + `1h→1m fetched=${JSON.stringify(t.fanOut1hTo1m?.fetched)}`,
    );
  }

  // Single machine-readable handoff line (serve.mjs [api] logs pollute stdout).
  process.stdout.write(`${M22_HS6_HANDOFF_MARKER}${JSON.stringify(handoff)}\n`);

  process.exit(evalResult.exitCode);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('[m22-hs6] FATAL', err);
    process.exit(ORACLE_EXIT.SETUP_FAIL);
  });
}
