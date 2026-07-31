#!/usr/bin/env node
/**
 * WORKER-HEAP-VALIDATION — GATE-01 for the gauge added for item 5.
 *
 * A gauge that reports a plausible number is worthless until it has been shown to move by a KNOWN
 * amount. This allocates a measured ballast inside a real dedicated worker and checks two things:
 *
 *   1. the new per-isolate worker reading moves by about the ballast size — the gauge can see it;
 *   2. the page's own JS heap and Performance.getMetrics do NOT move — the blind spot it closes was
 *      real, and by how much.
 *
 * The second half is the one that matters for the plan: it puts a number on how much memory every JS
 * gauge in this plan has been unable to see, using a quantity we chose ourselves.
 *
 * No product page is involved, so this cannot disturb anything and costs seconds.
 */
import fs from 'node:fs';

import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readSweepGauges } from './lib/sweep-gauges.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\WORKER-HEAP-VALIDATION-20260731.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Ballast target. Large enough to be unmistakable, small enough to be safe. */
const BALLAST_MB = 120;

const report = {
  signature: 'WORKER-HEAP-VALIDATION-V1',
  ruling: 'cbfdb81f4 item 5, gated per GATE-01',
  ballastTargetMB: BALLAST_MB,
  startedAtIso: new Date().toISOString(),
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

(async () => {
  let browser = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
    });
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    const browserCdp = await browser.target().createCDPSession();
    await cdp.send('Performance.enable').catch(() => {});
    await page.goto('about:blank');

    // A worker that allocates on demand. Float64Array is used because its cost is exact and known:
    // 8 bytes per element with no per-object overhead to argue about.
    await page.evaluate((mb) => {
      const src = `
        let ballast = null;
        self.onmessage = (e) => {
          if (e.data && e.data.cmd === 'alloc') {
            const els = Math.floor((e.data.mb * 1048576) / 8);
            ballast = new Float64Array(els);
            // Touch every page so the allocation is real and not merely reserved.
            for (let i = 0; i < ballast.length; i += 512) ballast[i] = i;
            self.postMessage({ ok: true, bytes: ballast.byteLength });
          } else if (e.data && e.data.cmd === 'free') {
            ballast = null;
            self.postMessage({ ok: true, bytes: 0 });
          }
        };
      `;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      window.__w = new Worker(url);
      window.__wReplies = [];
      window.__w.onmessage = (e) => window.__wReplies.push(e.data);
      window.__mb = mb;
      return true;
    }, BALLAST_MB);

    await sleep(2_000);
    const gaugeOpts = { cpuWindowMs: 1_500, forceGc: true, readOsFootprints };
    report.beforeBallast = await readSweepGauges(page, cdp, browserCdp, gaugeOpts);
    save();

    await page.evaluate(() => { window.__w.postMessage({ cmd: 'alloc', mb: window.__mb }); });
    // Wait for the worker to confirm the allocation rather than guessing at a delay.
    for (let i = 0; i < 40; i += 1) {
      const done = await page.evaluate(() => window.__wReplies.length > 0 && window.__wReplies[0].bytes > 0);
      if (done) break;
      await sleep(500);
    }
    report.workerConfirmedBytes = await page.evaluate(() => (window.__wReplies[0] || {}).bytes ?? null);
    await sleep(2_000);
    report.afterBallast = await readSweepGauges(page, cdp, browserCdp, gaugeOpts);
    save();

    await page.evaluate(() => { window.__w.postMessage({ cmd: 'free' }); });
    await sleep(3_000);
    report.afterFree = await readSweepGauges(page, cdp, browserCdp, gaugeOpts);
    save();
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    try { await browser?.close(); } catch { /* gone */ }
  }

  // ---- Grade ---------------------------------------------------------------
  const b = report.beforeBallast;
  const a = report.afterBallast;
  if (b && a) {
    const wBefore = b.workers?.workerHeapTotalMB ?? null;
    const wAfter = a.workers?.workerHeapTotalMB ?? null;
    const pageBefore = b.counters?.live?.jsHeapMB ?? null;
    const pageAfter = a.counters?.live?.jsHeapMB ?? null;
    const footBefore = b.footprint?.totalPrivateMB ?? null;
    const footAfter = a.footprint?.totalPrivateMB ?? null;
    const dWorker = (wAfter != null && wBefore != null) ? +(wAfter - wBefore).toFixed(2) : null;
    const dPage = (pageAfter != null && pageBefore != null) ? +(pageAfter - pageBefore).toFixed(2) : null;
    const dFoot = (footAfter != null && footBefore != null) ? +(footAfter - footBefore).toFixed(1) : null;
    const seesIt = dWorker != null && dWorker > BALLAST_MB * 0.7;
    const pageBlind = dPage != null && Math.abs(dPage) < BALLAST_MB * 0.2;
    report.grade = {
      workersSeenByPuppeteer: a.workers?.workerTargetsSeenByPuppeteer ?? null,
      workerHeapBeforeMB: wBefore,
      workerHeapAfterMB: wAfter,
      workerHeapDeltaMB: dWorker,
      pageJsHeapDeltaMB: dPage,
      osFootprintDeltaMB: dFoot,
      uaSpecificMemoryAvailable: a.workers?.uaSpecificMemory?.available ?? null,
      uaSpecificMemoryReason: a.workers?.uaSpecificMemory?.reason ?? null,
      crossOriginIsolated: a.workers?.uaSpecificMemory?.crossOriginIsolated ?? null,
      gaugeSeesWorkerHeap: seesIt,
      pageGaugeIsBlindToIt: pageBlind,
      verdict: (seesIt && pageBlind)
        ? `PASS. A ${BALLAST_MB} MB ballast inside a worker moved the new per-isolate gauge by ${dWorker} MB and moved the page JS heap by ${dPage} MB. The gauge sees worker memory and every JS gauge in this plan was blind to it, which is now demonstrated rather than argued.`
        : (seesIt
          ? `PARTIAL. The worker gauge moved by ${dWorker} MB as intended, but the page JS heap also moved by ${dPage} MB, so the two are not cleanly separated and the blind-spot claim is not established by this run.`
          : `FAIL. The worker gauge moved by ${dWorker} MB against a ${BALLAST_MB} MB ballast. It is not reading the worker isolate and must not be trusted in the baseline census.`),
    };
    const f = report.afterFree;
    if (f) {
      const wFree = f.workers?.workerHeapTotalMB ?? null;
      report.grade.workerHeapAfterFreeMB = wFree;
      report.grade.releasedOnDrop = (wFree != null && wAfter != null) ? wFree < wAfter - BALLAST_MB * 0.4 : null;
    }
  }
  save();

  console.error(`\n=== WORKER HEAP VALIDATION ${report.status} ===`);
  if (report.grade) {
    const g = report.grade;
    console.error(`worker targets seen: ${g.workersSeenByPuppeteer}`);
    console.error(`worker heap ${g.workerHeapBeforeMB} -> ${g.workerHeapAfterMB} MB (delta ${g.workerHeapDeltaMB})`);
    console.error(`page JS heap delta ${g.pageJsHeapDeltaMB} MB | OS footprint delta ${g.osFootprintDeltaMB} MB`);
    console.error(`measureUserAgentSpecificMemory available=${g.uaSpecificMemoryAvailable} crossOriginIsolated=${g.crossOriginIsolated} reason=${g.uaSpecificMemoryReason}`);
    console.error(`released on drop: ${g.releasedOnDrop}`);
    console.error(`\n${g.verdict}`);
  }
  console.error(`artifact ${OUT}`);
  process.exit(report.grade?.gaugeSeesWorkerHeap ? 0 : 1);
})();
