#!/usr/bin/env node
/**
 * Compare the zero-trade arm against the dead soak on the SAME gauge, at MATCHED BARS.
 *
 * The gap being read as corroboration of my +16.61 MB/closed-trade coefficient is currently a comparison of
 * two different instruments at equal ELAPSED TIME:
 *   - the soak recorded footprintTotalMB = summed OS private footprint over every process of its browser
 *   - the zero-trade arm recorded only JS heap, and the 2,044 MB figure came from Task Manager
 * Two different gauges and the wrong x axis. Memory tracks BARS, not hours, and the arms deliver bars at
 * different rates - so equal elapsed time compares different amounts of work.
 *
 * This reads the live arm with the soak's own gauge and matches on resident bars.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser } from './lib/find-soak-port.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ARM-FOOTPRINT-COMPARE-20260801.json';
const P = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const report = {
  signature: 'ARM-FOOTPRINT-COMPARE-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — read-only attach to the running arm.',
  whyThisExists: 'An 856 MB gap is being read as corroboration of the +16.61 MB per closed trade coefficient. It was measured on two different gauges at equal elapsed time. Memory tracks bars, not hours.',
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  const found = await findSoakBrowser();
  if (!found) throw new Error('no live browser with a chart page');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${found.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];
  const browserCdp = await browser.target().createCDPSession();

  const info = await browserCdp.send('SystemInfo.getProcessInfo');
  const ids = (info.processInfo || []).map((p) => p.id);
  const fps = await readOsFootprints(ids);
  let total = 0;
  let pageRenderer = 0;
  const byType = {};
  for (const p of info.processInfo || []) {
    const fp = fps[p.id];
    if (!fp) continue;
    total += fp.privateMB;
    const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
    byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
    if (/renderer/i.test(p.type) && fp.privateMB > pageRenderer) pageRenderer = fp.privateMB;
  }

  let bars = 0;
  for (const f of page.frames()) bars += (await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0)) || 0;

  const trades = await page.mainFrame().evaluate(() => {
    const om = (window.chart && window.chart.orderManager) || window.orderManager;
    return om && Array.isArray(om.closedPositions) ? om.closedPositions.length : null;
  }).catch(() => null);

  report.zeroTradeArm = {
    gauge: 'summed OS private footprint over every process of this browser — identical route to the soak\'s footprintTotalMB',
    footprintTotalMB: +total.toFixed(1),
    pageRendererPrivateMB: +pageRenderer.toFixed(1),
    byType,
    residentBars: bars,
    closedPositions: trades,
  };

  // The soak, matched on BARS rather than on hours.
  const s1 = JSON.parse(fs.readFileSync(P + 'TEN-HOUR-SEG-01-20260731.json', 'utf8')).samples || [];
  let best = null;
  for (const r of s1) {
    if (!Number.isFinite(r.residentBars) || !Number.isFinite(r.footprintTotalMB)) continue;
    if (best === null || Math.abs(r.residentBars - bars) < Math.abs(best.residentBars - bars)) best = r;
  }
  report.withTradesMatched = best ? {
    residentBars: best.residentBars,
    footprintTotalMB: best.footprintTotalMB,
    closedTrades: best.closedTrades,
    hours: best.hours,
    barMismatchPercent: +((Math.abs(best.residentBars - bars) / bars) * 100).toFixed(1),
  } : null;

  if (best) {
    const gap = best.footprintTotalMB - total;
    const trueTrades = best.closedTrades;
    const predicted = trueTrades != null ? trueTrades * 16.61 : null;
    report.comparison = {
      gapMB: +gap.toFixed(1),
      closedTradesInTheWithTradesArm: trueTrades,
      predictedFromCoefficientMB: predicted != null ? +predicted.toFixed(0) : null,
      coefficientUsed: '+16.61 MB per closed trade, CI [11.81, 21.42], fitted with hours held',
      predictedRangeMB: trueTrades != null ? [+(trueTrades * 11.81).toFixed(0), +(trueTrades * 21.42).toFixed(0)] : null,
      gapInsideCI: trueTrades != null ? (gap >= trueTrades * 11.81 && gap <= trueTrades * 21.42) : null,
    };
    // The tension that has to be declared: my OWN per-bar slopes for the two conditions are 23.98 (zero-trade)
    // and 24.55 (with trades). Those differ by 0.57 MB per thousand bars, which at this bar count predicts a
    // gap of tens of MB, not hundreds. Both cannot be right.
    const slopeImpliedGap = (24.55 - 23.98) * (bars / 1000);
    report.comparison.slopeImpliedGapMB = +slopeImpliedGap.toFixed(0);
    report.comparison.tension = `My published per-bar slopes are 23.98 MB/kbar (zero-trade) and 24.55 (with trades). At ${bars.toLocaleString()} bars those differ by only ${slopeImpliedGap.toFixed(0)} MB, yet the measured gap is ${gap.toFixed(0)} MB. A trade term worth hundreds of MB CANNOT sit inside two slopes that agree to 2.3% unless it lives in the INTERCEPT rather than the slope, or unless the arms differ in something other than trades.`;
  }
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 800);
} finally {
  try { if (browser) await browser.disconnect(); } catch { /* gone */ }
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
