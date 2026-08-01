#!/usr/bin/env node
/**
 * Read-only verification of the running zero-trade arm's defining variable.
 *
 * The arm booted with a trade reader that used the wrong object path and returned null. Null is not zero, and
 * the run cannot be reloaded to fix it, so the assertion is made from outside instead and published as its own
 * artifact. Also settles the `ok=false ind=2` line in the boot log: the requirement is TWO indicators per
 * panel, so 2 is the target, and the flag needs reading rather than trusting.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser } from './lib/find-soak-port.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ZERO-TRADE-VERIFY-20260801.json';
const report = {
  signature: 'ZERO-TRADE-VERIFY-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — read-only attach, no navigation.',
  whyThisExists: 'The arm\'s in-process trade reader used the wrong object path and returned null. An arm whose defining variable is unverified is not an arm.',
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  const found = await findSoakBrowser();
  if (!found) throw new Error('no live browser with a chart page');
  report.attachedTo = { port: found.port, chartPages: found.chartPages };
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${found.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];

  const perFrame = [];
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const ch = window.chart;
      if (!ch) return null;
      const om = ch.orderManager || window.orderManager;
      const svc = om && om.orderService;
      const rs = ch.replaySystem;
      return {
        url: location.href.slice(0, 100),
        isHost: window.top === window,
        bars: Array.isArray(ch.data) ? ch.data.length : null,
        indicatorsActive: ch.indicators && Array.isArray(ch.indicators.active) ? ch.indicators.active.length : null,
        indicatorTypes: ch.indicators && Array.isArray(ch.indicators.active) ? ch.indicators.active.map((i) => i && i.type).slice(0, 6) : null,
        replayPlaying: !!(rs && rs.isPlaying),
        replaySpeed: rs ? (rs.speed ?? rs.playbackSpeed ?? null) : null,
        closedTrades: svc && Array.isArray(svc.closedTrades) ? svc.closedTrades.length : null,
        openPositions: svc && Array.isArray(svc.openPositions) ? svc.openPositions.length : null,
        orders: svc && Array.isArray(svc.orders) ? svc.orders.length : null,
      };
    }).catch(() => null);
    if (r) perFrame.push(r);
  }
  report.perFrame = perFrame;

  const closedReadable = perFrame.filter((f) => f.closedTrades != null);
  const totalClosed = closedReadable.reduce((s, f) => s + f.closedTrades, 0);
  const minInd = perFrame.length ? Math.min(...perFrame.map((f) => f.indicatorsActive ?? 0)) : null;
  report.verdict = {
    panels: perFrame.length,
    closedTradeCountReadableOn: closedReadable.length,
    totalClosedTrades: closedReadable.length ? totalClosed : null,
    minIndicatorsPerPanel: minInd,
    speeds: [...new Set(perFrame.map((f) => f.replaySpeed))],
    playingPanels: perFrame.filter((f) => f.replayPlaying).length,
  };
  report.verdict.zeroTradesVerified = closedReadable.length > 0 && totalClosed === 0;
  report.verdict.indicatorRequirementMet = minInd != null && minInd >= 2;
  report.verdict.reading = closedReadable.length === 0
    ? 'UNVERIFIED: no frame exposes a readable closed-trade list. The arm cannot claim zero trades.'
    : (totalClosed === 0
      ? `VERIFIED: ${closedReadable.length} of ${perFrame.length} chart frames expose a readable closed-trade list and every one reads 0, with ${perFrame.reduce((s, f) => s + (f.orders || 0), 0)} resting orders. The arm's defining variable holds. Indicators: minimum ${minInd} per panel against a requirement of 2, so the boot log's ok=false is not an indicator shortfall.`
      : `VOID: ${totalClosed} closed trades exist in a zero-trade arm.`);
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 600);
} finally {
  try { if (browser) await browser.disconnect(); } catch { /* gone */ }
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ verdict: report.verdict, error: report.error }, null, 1));
