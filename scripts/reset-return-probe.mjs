#!/usr/bin/env node
/**
 * RESET-RETURN-PROBE — the RETURN axis, measured on a HEAVY document.
 *
 * The Director rejected my "no defect" closure of item 7 and was right to. My first measurement took a
 * nearly empty session — 369 MB and a 17 MB heap — through logout and back. That test cannot distinguish
 * a benign back-forward cache from a catastrophic one, because it never gave the cache anything heavy to
 * hold. Three light documents and three 1.5 GB documents are the same document COUNT and a completely
 * different product.
 *
 * WHAT THIS DOES DIFFERENTLY
 *   1. Reaches a heavy CONF-01 state first — four panels, four distinct datasets, two indicators each,
 *      carrying at least a declared gigabyte above four-panel first paint — before any exit is taken.
 *   2. Takes ONE exit per run, named, because reload, logout and tab-close are different code paths:
 *        reload    — replaces the same document. NOT a bfcache path. The PO named it first and it has
 *                    never been run.
 *        logout    — cross-document navigation. The ONLY one of the three that bfcache can hold, so it is
 *                    where the second arm is worth spending.
 *        tabclose  — destroys the document. Tests whether the renderer process and its allocator arenas
 *                    give anything back.
 *   3. Reports what the OUTGOING DOCUMENT COSTS, not just how many documents exist: footprint is read
 *      immediately after the exit and before re-entry, so the memory still held by a document the user has
 *      already left is a number rather than an inference.
 *   4. Measures re-entry against a LIKE-FOR-LIKE reference. Session 1 records two baselines — single-chart
 *      first paint and four-panel first paint — and re-entry is compared to whichever state the app
 *      actually restored to, with the restored panel count recorded. Comparing a four-panel baseline to a
 *      one-chart re-entry would manufacture a result.
 *
 * THE BAR, from the ruling: session N+1 must start where session 1 started.
 */
import fs from 'node:fs';

import {
  dismissCookieBanner, uiLoginDeployed, waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { bootConf01Session, readConf01State, waitConf01PanelsReady } from './lib/conf01-session.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const EXIT_MODE = String(argOf('exit', 'reload'));            // reload | logout | tabclose
const BFCACHE = String(argOf('bfcache', 'on')) === 'on';
const TARGET_HEAVY_MB = Number(argOf('heavy-mb', 1024));
const HEAVY_CAP_MIN = Number(argOf('heavy-cap-min', 25));
const CYCLES = Number(argOf('cycles', 2));
const SPEED = Number(argOf('speed', 30));
const OUT = argOf('out', `c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\RESET-RETURN-${EXIT_MODE.toUpperCase()}-${BFCACHE ? 'BFON' : 'BFOFF'}-20260731.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = String(process.env.TEST_VPS_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');

const report = {
  signature: 'RESET-RETURN-PROBE-V1',
  artifactFile: OUT.split('\\').pop(),
  ruling: 'RESET-01 — the third axis. Baseline, slope and RETURN.',
  theBar: 'session N+1 must start where session 1 started',
  // RESET-01 makes this a required field on every harness artifact.
  bfcacheState: BFCACHE ? 'ENABLED (Chrome default — what users run)' : 'DISABLED via --disable-features=BackForwardCache',
  exitMode: EXIT_MODE,
  exitModeNote: {
    reload: 'Replaces the same document. NOT a back-forward cache path, so both arms are equivalent here and only one is run. This is the exit the PO named first.',
    logout: 'Cross-document navigation. The ONLY one of the three exits that bfcache can hold, so it is the one where the two arms can differ.',
    tabclose: 'Destroys the document outright. Tests whether the renderer process and its allocator arenas return anything.',
  }[EXIT_MODE] || 'unknown exit mode',
  design: {
    targetHeavyMBAboveFourPanelFirstPaint: TARGET_HEAVY_MB,
    heavyCapMinutes: HEAVY_CAP_MIN,
    cycles: CYCLES,
    speed: SPEED,
    whyHeavy: 'The first attempt at this measurement used a 369 MB, 17 MB-heap session. A light document being released says nothing about whether a heavy one is.',
  },
  startedAtIso: new Date().toISOString(),
  cycles: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

(async () => {
  let session = null;
  let browser = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      replaySpeed: SPEED,
      placeOrder: false,
      label: `reset-return-${EXIT_MODE}`,
      extraArgs: BFCACHE ? [] : ['--disable-features=BackForwardCache'],
      preloadScript: 'window.CHART_BACKTEST_SMART_INITIAL_LIMIT = 32000;',
      // Session 1's cheap reference, captured before any layout change.
      onSingleReady: async (page) => {
        await sleep(6_000);
        report.singleChartFirstPaint = await readAll(page);
      },
    });
    browser = session.browser;
    let { page, cdp } = session;
    const { browserCdp } = session;
    report.buildStamp = session.conf01?.buildId ?? null;
    report.conf01 = {
      panels: session.conf01?.panels ?? null,
      distinctFileIds: session.conf01?.distinctFileIds ?? null,
      distinctTimeframes: session.conf01?.distinctTimeframes ?? null,
    };

    // ---- helpers that must survive a page being replaced ------------------
    // The first attempt at this run lost its page and my gauges reported `undefined` for four minutes
    // because both readers swallowed their errors into `{}`. An instrument that cannot say WHY it stopped
    // answering is not usable for an unattended measurement, so failures are now recorded and the run
    // stops rather than looping on nothing.
    const readErrors = [];
    let crashSignal = null;
    page.on('error', (e) => { crashSignal = `page crashed: ${String(e?.message || e).slice(0, 120)}`; });
    page.on('framenavigated', (f) => {
      try { if (f === page.mainFrame()) report.mainFrameNavigations = (report.mainFrameNavigations || 0) + 1; } catch { /* ignore */ }
    });

    async function footprints() {
      try {
        const info = await browserCdp.send('SystemInfo.getProcessInfo');
        const fps = await readOsFootprints((info.processInfo || []).map((p) => p.id));
        let total = 0;
        let renderer = 0;
        let gpu = 0;
        for (const p of info.processInfo || []) {
          const fp = fps[p.id];
          if (!fp) continue;
          total += fp.privateMB;
          if (/renderer/i.test(p.type) && fp.privateMB > renderer) renderer = fp.privateMB;
          if (/gpu/i.test(p.type)) gpu += fp.privateMB;
        }
        return {
          totalPrivateMB: +total.toFixed(1),
          pageRendererPrivateMB: +renderer.toFixed(1),
          gpuPrivateMB: +gpu.toFixed(1),
          rendererProcessCount: (info.processInfo || []).filter((p) => /renderer/i.test(p.type)).length,
        };
      } catch (err) {
        readErrors.push({ reader: 'footprints', why: String(err?.message || err).slice(0, 140), atIso: new Date().toISOString() });
        return {};
      }
    }
    async function counters(sess) {
      try {
        const { metrics } = await sess.send('Performance.getMetrics');
        const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
        return {
          documents: m.Documents ?? null,
          frames: m.Frames ?? null,
          nodes: m.Nodes ?? null,
          listeners: m.JSEventListeners ?? null,
          jsHeapMB: m.JSHeapUsedSize ? +(m.JSHeapUsedSize / 1048576).toFixed(2) : null,
        };
      } catch (err) {
        readErrors.push({ reader: 'counters', why: String(err?.message || err).slice(0, 140), atIso: new Date().toISOString() });
        return {};
      }
    }
    async function readAll(pg, sess = null) {
      const s = sess || cdp;
      await s.send('HeapProfiler.collectGarbage').catch(() => {});
      await sleep(1_500);
      const state = await readConf01State(pg).catch(() => null);
      return {
        ...(await counters(s)),
        ...(await footprints()),
        realms: state?.panels ?? null,
        residentBars: state?.totalBars ?? null,
        advancingPanels: state?.advancingPanels ?? null,
        atIso: new Date().toISOString(),
      };
    }

    report.fourPanelFirstPaint = await readAll(page);
    const baselineMB = report.fourPanelFirstPaint.totalPrivateMB;
    console.error(`[return] session 1 four-panel first paint: ${baselineMB} MB, heap ${report.fourPanelFirstPaint.jsHeapMB} MB, docs ${report.fourPanelFirstPaint.documents}, bars ${report.fourPanelFirstPaint.residentBars}`);
    save();

    // ---- the cycles -------------------------------------------------------
    for (let c = 1; c <= CYCLES; c += 1) {
      const row = { cycle: c, exitMode: EXIT_MODE };

      // --- go heavy ---
      const heavyDeadline = Date.now() + HEAVY_CAP_MIN * 60_000;
      const want = (c === 1 ? baselineMB : row.reentryFootprintMB || baselineMB) + TARGET_HEAVY_MB;
      let heavy = await readAll(page);
      let blindReads = 0;
      while (Date.now() < heavyDeadline && (heavy.totalPrivateMB ?? 0) < want) {
        await sleep(45_000);
        heavy = await readAll(page);
        const blind = heavy.totalPrivateMB == null || heavy.documents == null;
        blindReads = blind ? blindReads + 1 : 0;
        console.error(`[return] cycle ${c} heavy ${heavy.totalPrivateMB} MB / target ${Math.round(want)} MB, bars ${heavy.residentBars}, docs ${heavy.documents}${blind ? ' [BLIND READ]' : ''}`);
        if (crashSignal || blindReads >= 2) {
          row.heavyPhaseAborted = crashSignal
            || `gauges returned nothing twice in a row during the heavy phase; last errors ${JSON.stringify(readErrors.slice(-3))}`;
          console.error(`[return] cycle ${c} ABORTING heavy phase: ${row.heavyPhaseAborted}`);
          break;
        }
      }
      row.heavyPeak = heavy;
      row.heavyAboveBaselineMB = (heavy.totalPrivateMB != null && baselineMB != null)
        ? +(heavy.totalPrivateMB - baselineMB).toFixed(1) : null;
      row.reachedTarget = (row.heavyAboveBaselineMB ?? 0) >= TARGET_HEAVY_MB;
      row.heavyNote = row.reachedTarget
        ? `carried ${row.heavyAboveBaselineMB} MB above four-panel first paint before the exit`
        : `only reached ${row.heavyAboveBaselineMB} MB above first paint within the ${HEAVY_CAP_MIN}-minute cap; the exit was taken anyway and the shortfall is declared rather than hidden`;
      save();

      // --- take the exit ---
      row.exitAtIso = new Date().toISOString();
      if (EXIT_MODE === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 }).catch((e) => { row.exitError = String(e?.message || e).slice(0, 120); });
      } else if (EXIT_MODE === 'logout') {
        await page.evaluate(async () => {
          try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
          window.location.href = '/login/';
        }).catch((e) => { row.exitError = String(e?.message || e).slice(0, 120); });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      } else if (EXIT_MODE === 'tabclose') {
        await page.close().catch((e) => { row.exitError = String(e?.message || e).slice(0, 120); });
        page = await browser.newPage();
        cdp = await page.createCDPSession();
        await cdp.send('Performance.enable').catch(() => {});
      }
      await sleep(8_000);

      // --- WHAT DOES THE DEPARTED DOCUMENT STILL COST? ---
      row.afterExit = await readAll(page, cdp);
      row.stillHeldMB = (row.heavyPeak.totalPrivateMB != null && row.afterExit.totalPrivateMB != null)
        ? +(row.afterExit.totalPrivateMB - baselineMB).toFixed(1) : null;
      row.releasedByExitMB = (row.heavyPeak.totalPrivateMB != null && row.afterExit.totalPrivateMB != null)
        ? +(row.heavyPeak.totalPrivateMB - row.afterExit.totalPrivateMB).toFixed(1) : null;
      row.releasedFractionOfHeavy = (row.releasedByExitMB != null && row.heavyAboveBaselineMB)
        ? +(row.releasedByExitMB / row.heavyAboveBaselineMB).toFixed(3) : null;
      console.error(`[return] cycle ${c} after ${EXIT_MODE}: ${row.afterExit.totalPrivateMB} MB (released ${row.releasedByExitMB} of ${row.heavyAboveBaselineMB} heavy MB), docs ${row.afterExit.documents}`);
      save();

      // --- re-enter and read FIRST PAINT ---
      const t0 = Date.now();
      if (EXIT_MODE === 'logout') {
        await dismissCookieBanner(page).catch(() => {});
        await uiLoginDeployed(page, ORIGIN, String(process.env.TEST_EMAIL || '').trim(), String(process.env.TEST_PASSWORD || '').trim());
      } else if (EXIT_MODE === 'tabclose') {
        await page.goto(`${ORIGIN}/chart/`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
      }
      await waitForDistV9SingleReady(page, { timeout: 180_000 }).catch(() => {});
      // If the app restores the four-panel layout by itself, give it the chance to before reading.
      await waitConf01PanelsReady(page, { timeoutMs: 60_000, want: 4 }).catch(() => {});
      await sleep(8_000);
      row.reentryFirstPaintSeconds = +((Date.now() - t0) / 1000).toFixed(1);
      row.reentry = await readAll(page, cdp);
      row.reentryFootprintMB = row.reentry.totalPrivateMB;

      // --- like-for-like: which session-1 reference does this re-entry match? ---
      const restoredRealms = row.reentry.realms;
      const ref = (restoredRealms != null && restoredRealms >= 4)
        ? { name: 'fourPanelFirstPaint', mb: report.fourPanelFirstPaint?.totalPrivateMB, heap: report.fourPanelFirstPaint?.jsHeapMB, docs: report.fourPanelFirstPaint?.documents }
        : { name: 'singleChartFirstPaint', mb: report.singleChartFirstPaint?.totalPrivateMB, heap: report.singleChartFirstPaint?.jsHeapMB, docs: report.singleChartFirstPaint?.documents };
      row.comparedAgainst = ref.name;
      row.comparedAgainstNote = `re-entry restored ${restoredRealms} realm(s), so it is graded against session 1's ${ref.name}. Grading a ${restoredRealms}-realm re-entry against a four-panel baseline would manufacture a result.`;
      row.returnDeltaMB = (row.reentryFootprintMB != null && ref.mb != null)
        ? +(row.reentryFootprintMB - ref.mb).toFixed(1) : null;
      row.returnDeltaHeapMB = (row.reentry.jsHeapMB != null && ref.heap != null)
        ? +(row.reentry.jsHeapMB - ref.heap).toFixed(2) : null;
      row.returnDeltaDocuments = (row.reentry.documents != null && ref.docs != null)
        ? row.reentry.documents - ref.docs : null;
      console.error(`[return] cycle ${c} re-entry: ${row.reentryFootprintMB} MB vs ${ref.name} ${ref.mb} MB => delta ${row.returnDeltaMB} MB, docs ${row.reentry.documents} vs ${ref.docs}, realms ${restoredRealms}`);
      report.cycles.push(row);
      save();
    }
    report.gaugeReadErrors = readErrors.slice(0, 20);
    report.crashSignal = crashSignal;
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    save();
    try { await browser?.close?.(); } catch { /* gone */ }
  }

  // ---- Grade the RETURN axis ----------------------------------------------
  const cs = report.cycles.filter((r) => r.returnDeltaMB != null);
  if (cs.length) {
    const deltas = cs.map((r) => r.returnDeltaMB);
    const held = cs.map((r) => r.stillHeldMB);
    const releasedFrac = cs.map((r) => r.releasedFractionOfHeavy);
    report.returnAxis = {
      exitMode: EXIT_MODE,
      bfcacheState: report.bfcacheState,
      heavyAboveBaselineMBByCycle: cs.map((r) => r.heavyAboveBaselineMB),
      allCyclesReachedTarget: cs.every((r) => r.reachedTarget),
      returnDeltaMBByCycle: deltas,
      returnDeltaHeapMBByCycle: cs.map((r) => r.returnDeltaHeapMB),
      returnDeltaDocumentsByCycle: cs.map((r) => r.returnDeltaDocuments),
      stillHeldAboveBaselineAfterExitMBByCycle: held,
      fractionOfHeavyStateReleasedByExit: releasedFrac,
      comparedAgainstByCycle: cs.map((r) => r.comparedAgainst),
      reentryFirstPaintSecondsByCycle: cs.map((r) => r.reentryFirstPaintSeconds),
      // The bar, stated as a number.
      worstReturnDeltaMB: Math.max(...deltas),
      returnsToBaseline: deltas.every((d) => d <= 50),
      verdict: deltas.every((d) => d <= 50)
        ? `RETURN AXIS PASSES for the ${EXIT_MODE} exit with bfcache ${BFCACHE ? 'ON' : 'OFF'}: after carrying ${cs.map((r) => r.heavyAboveBaselineMB).join(' and ')} MB above first paint, re-entry landed within ${Math.max(...deltas)} MB of session 1. Session N+1 starts where session 1 started.`
        : `RETURN AXIS FAILS for the ${EXIT_MODE} exit with bfcache ${BFCACHE ? 'ON' : 'OFF'}: re-entry starts ${deltas.join(' then ')} MB above session 1 after carrying ${cs.map((r) => r.heavyAboveBaselineMB).join(' and ')} MB of heavy state. A build that passes baseline and slope but starts session two ${Math.max(...deltas)} MB high has deferred the failure, not fixed it.`,
      heavyVsLight: `My earlier light test carried a 369 MB session and measured a 106.6 MB staircase over three cycles with bfcache on. This run carried ${cs.map((r) => r.heavyAboveBaselineMB).join('/')} MB above baseline. If the return delta scales with how heavy the document was, the cache is not benign and the earlier closure was an artifact of a light test.`,
    };
    report.verdict = report.returnAxis.verdict;
  } else {
    report.verdict = `No gradeable cycle. ${report.void || report.cycles.length + ' cycle(s) recorded without a return delta.'}`;
  }
  // RESET-01: signature must match filename before publishing.
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : `FAIL: ${OUT} vs declared ${report.artifactFile}`;
  save();

  console.error(`\n=== RESET RETURN ${EXIT_MODE} bfcache=${BFCACHE ? 'ON' : 'OFF'} ${report.status} build=${report.buildStamp} ===`);
  if (report.returnAxis) {
    console.error(`heavy above baseline: ${JSON.stringify(report.returnAxis.heavyAboveBaselineMBByCycle)} MB (target ${TARGET_HEAVY_MB})`);
    console.error(`still held after exit: ${JSON.stringify(report.returnAxis.stillHeldAboveBaselineAfterExitMBByCycle)} MB`);
    console.error(`fraction of heavy released by the exit: ${JSON.stringify(report.returnAxis.fractionOfHeavyStateReleasedByExit)}`);
    console.error(`RETURN DELTA: ${JSON.stringify(report.returnAxis.returnDeltaMBByCycle)} MB, docs ${JSON.stringify(report.returnAxis.returnDeltaDocumentsByCycle)}`);
  }
  console.error(`\n${report.verdict}`);
  console.error(`signature/filename: ${report.signatureFilenameCheck}`);
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
