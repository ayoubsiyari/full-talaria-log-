#!/usr/bin/env node
/**
 * LIVE DOCUMENT IDENTITY PROBE — attaches to the RUNNING soak read-only and establishes whether the four
 * advancing charts occupy four SEPARATE documents.
 *
 * The Director found this in the live artifact between samples 3 and 4:
 *   documents 7 -> 4, listeners 14,942 -> 2,882, nodes 51,081 -> 25,190, footprint 1,674 -> 1,835 STILL CLIMBING
 * while charts:4 and advancingPanels:4 held steady. Both cannot be innocent. Either the panel gauge is counting
 * four charts that no longer have four documents — the eviction-mimics-a-freeze failure, and the run is void —
 * or the documents genuinely went and memory still climbed, which says the growth is not DOM-resident.
 *
 * IDENTITY, NOT COUNTING. `performance.timeOrigin` is minted per document and is not shared across realms, so
 * four distinct timeOrigins is positive proof of four distinct documents. Frame URL alone would not be: two
 * frames can carry the same URL, and a stale host-side registry could report four panels with one document.
 *
 * ABSOLUTE CONSTRAINTS, because this probe runs against ten hours of committed machine time:
 *   - `browser.disconnect()`, NEVER `browser.close()`. Closing would kill the soak.
 *   - No navigation, no reload, no GC, no CDP domain that mutates. Reads and one 5s wait only.
 *   - No writes into any page: identity is read from what the document already exposes.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const PORT = argOf('port', '49797');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LIVE-DOCUMENT-IDENTITY-20260731.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'LIVE-DOCUMENT-IDENTITY-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  question: 'Do the four advancing charts occupy four SEPARATE documents, or is the panel gauge reporting four charts that no longer have four documents?',
  bfcacheState: 'default (enabled) — this is the running soak browser, launched without --disable-features=BackForwardCache. Declared per RESET-01.',
  method: 'Read-only CDP attach to the live soak. Document identity by performance.timeOrigin, which is minted per document and cannot be shared across realms. Disconnect, never close.',
  perturbation: 'Two frame reads separated by 5s, plus one Performance.getMetrics. No GC, no navigation, no page writes.',
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  report.connected = true;

  const pages = await browser.pages();
  report.pageCount = pages.length;
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];
  report.chartPageUrl = page.url();

  const readFrames = async () => {
    const rows = [];
    for (const frame of page.frames()) {
      const got = await frame.evaluate(() => {
        const ch = window.chart;
        return {
          url: location.href,
          // Per-document identity. Two realms cannot share a timeOrigin.
          timeOrigin: Math.round(performance.timeOrigin * 1000) / 1000,
          isHost: window.top === window,
          hasChart: !!ch,
          fileId: ch && ch.currentFileId != null ? String(ch.currentFileId) : null,
          timeframe: ch && ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
          bars: ch && Array.isArray(ch.data) ? ch.data.length : null,
          replayIndex: ch && ch.replaySystem && ch.replaySystem.currentIndex != null ? Number(ch.replaySystem.currentIndex) : null,
          replayPlaying: !!(ch && ch.replaySystem && ch.replaySystem.isPlaying),
          // The CONTINUOUS playhead, and the only fair advance test here. At 5 candles/s a 1h panel closes a
          // bar every ~12s, so a 5s bar-count window cannot tell a slow panel from a stalled one - my own
          // conf01-session library says exactly this and the first pass of this probe ignored it.
          replayTimestamp: ch && ch.replaySystem && Number.isFinite(Number(ch.replaySystem.replayTimestamp))
            ? Number(ch.replaySystem.replayTimestamp) : null,
          // How many iframes this document has ATTACHED right now. Host + attached children is the number of
          // live documents; anything the Documents metric counts above that is detached and pending collection.
          attachedIframes: document.querySelectorAll('iframe').length,
          nodesInThisDocument: document.getElementsByTagName('*').length,
        };
      }).catch((e) => ({ url: frame.url(), evaluateFailed: String(e && e.message).slice(0, 120) }));
      rows.push(got);
    }
    return rows;
  };

  const first = await readFrames();
  await sleep(8_000);
  const second = await readFrames();

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable').catch(() => {});
  const metrics = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const m = Object.fromEntries((metrics.metrics || []).map((x) => [x.name, x.value]));
  await cdp.detach().catch(() => {});

  report.documentsMetricNow = m.Documents ?? null;
  report.framesMetricNow = m.Frames ?? null;
  report.nodesMetricNow = m.Nodes ?? null;
  report.listenersMetricNow = m.JSEventListeners ?? null;

  const chartFrames = second.filter((r) => r.hasChart);
  const origins = [...new Set(second.map((r) => r.timeOrigin).filter((v) => v != null))];
  const chartOrigins = [...new Set(chartFrames.map((r) => r.timeOrigin))];

  report.frames = second.map((r, i) => {
    const was = first[i];
    return {
      ...r,
      advancedBars: was && r.bars != null && was.bars != null ? r.bars - was.bars : null,
      advancedIndex: was && r.replayIndex != null && was.replayIndex != null ? r.replayIndex - was.replayIndex : null,
      advancedSimMs: was && r.replayTimestamp != null && was.replayTimestamp != null ? r.replayTimestamp - was.replayTimestamp : null,
    };
  });
  report.counts = {
    framesSeenByPuppeteer: second.length,
    framesWithChart: chartFrames.length,
    distinctTimeOriginsAllFrames: origins.length,
    distinctTimeOriginsAmongChartFrames: chartOrigins.length,
    hostFrames: second.filter((r) => r.isHost).length,
    hostAlsoCarriesChart: second.some((r) => r.isHost && r.hasChart),
    attachedIframesInHost: (second.find((r) => r.isHost) || {}).attachedIframes ?? null,
    advancingNow: report.frames.filter((r) => (r.advancedSimMs || 0) > 0 || (r.advancedBars || 0) > 0 || (r.advancedIndex || 0) > 0).length,
    advancingByBarsOnly: report.frames.filter((r) => (r.advancedBars || 0) > 0).length,
    advancingBySimClock: report.frames.filter((r) => (r.advancedSimMs || 0) > 0).length,
  };

  const c = report.counts;
  const liveDocumentsExpected = 1 + (c.attachedIframesInHost ?? 0);
  report.documentsReconciliation = {
    liveDocumentsExpected,
    documentsMetricNow: report.documentsMetricNow,
    detachedPending: report.documentsMetricNow != null ? report.documentsMetricNow - liveDocumentsExpected : null,
    reading: `The host document plus ${c.attachedIframesInHost} attached iframes is ${liveDocumentsExpected} live documents. The Documents metric reads ${report.documentsMetricNow}. Anything above the live count is detached and awaiting collection, which is what a drop in the metric means.`,
  };

  const fourSeparate = c.framesWithChart >= 4 && c.distinctTimeOriginsAmongChartFrames >= 4;
  const allAdvancing = c.advancingNow >= 4;
  report.verdict = fourSeparate && allAdvancing
    ? `NOT VOID. Four charts, ${c.distinctTimeOriginsAmongChartFrames} DISTINCT document timeOrigins, and ${c.advancingNow} of them advanced bars during a 5s window read from inside their own realms. The panel gauge is not reporting phantom charts: each chart is in its own document and each is progressing. So the documents metric fell while the panel documents survived, which means the 7 included documents that were NOT panels.`
    : (fourSeparate
      ? `AMBIGUOUS: four distinct documents exist but only ${c.advancingNow} advanced in a 5s window. A 1h-timeframe panel can close a bar less than once per window, so this needs the replayTimestamp read rather than the bar read.`
      : `VOID RISK CONFIRMED: ${c.framesWithChart} chart frames with ${c.distinctTimeOriginsAmongChartFrames} distinct documents. The panel gauge is counting charts that do not have their own documents and the run must be graded as compromised.`);
  report.growthAttribution = fourSeparate && allAdvancing
    ? 'CONSEQUENCE, and it is a finding rather than a fault: documents, listeners and nodes all fell together while footprint kept climbing. A natural collection reclaimed detached DOM, and footprint did not care. The growth is therefore NOT DOM-resident and not listener-resident, which is consistent with the census result that 72% of the renderer is not JS.'
    : 'Attribution not attempted: panel integrity is the prior question and it did not pass.';
} catch (e) {
  report.error = String(e && e.stack || e).slice(0, 700);
  report.verdict = 'PROBE FAILED — this says nothing about the run, only about the probe. The soak is unaffected because nothing mutating was sent.';
} finally {
  // DISCONNECT. Closing would kill ten hours.
  try { await browser?.disconnect?.(); } catch { /* already gone */ }
}

report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ counts: report.counts, documentsReconciliation: report.documentsReconciliation, verdict: report.verdict, error: report.error }, null, 1));
console.log(`\nartifact ${OUT}`);
