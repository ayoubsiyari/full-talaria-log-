#!/usr/bin/env node
/**
 * Enumerate the real order/trade surface instead of guessing field names a third time.
 *
 * Two guesses have now failed: orderManager.closedTrades (wrong object) and orderService.closedTrades (wrong
 * field). Both returned null, and null reads as "nothing there" rather than as "I looked in the wrong place".
 * This lists what actually exists so the zero-trade assertion can name a field that is real.
 *
 * Also measures bar ADVANCEMENT per frame over a real interval, because isPlaying read 1-of-4 while the boot
 * log observed 4 playing, and conf01-session's own comment warns that at these cadences a slow-timeframe panel
 * looks stalled between bar closes.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser } from './lib/find-soak-port.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ORDER-FIELD-CENSUS-20260801.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { signature: 'ORDER-FIELD-CENSUS-V1', at: new Date().toISOString(), bfcacheState: 'default (enabled) — read-only attach.' };

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  const found = await findSoakBrowser();
  if (!found) throw new Error('no live browser with a chart page');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${found.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];
  const host = page.mainFrame();

  report.surface = await host.evaluate(() => {
    const out = {};
    const describe = (obj, name) => {
      if (!obj) return { present: false };
      const keys = [];
      let o = obj;
      const seen = new Set();
      for (let depth = 0; o && depth < 3; depth += 1, o = Object.getPrototypeOf(o)) {
        for (const k of Object.getOwnPropertyNames(o)) {
          if (seen.has(k)) continue;
          seen.add(k);
          if (!/trade|position|order|closed|hist|fill|exec/i.test(k)) continue;
          let v;
          try { v = obj[k]; } catch { v = '(threw)'; }
          keys.push({ key: k, type: Array.isArray(v) ? `array[${v.length}]` : typeof v });
        }
      }
      return { present: true, matching: keys };
    };
    const ch = window.chart;
    const om = (ch && ch.orderManager) || window.orderManager;
    out.chartPresent = !!ch;
    out.orderManager = describe(om, 'orderManager');
    out.orderService = describe(om && om.orderService, 'orderService');
    out.windowLevel = Object.keys(window).filter((k) => /order|trade|position/i.test(k)).slice(0, 25);
    return out;
  }).catch((e) => ({ error: String(e).slice(0, 300) }));

  // Bar advancement, measured rather than inferred from an isPlaying flag.
  const snap = async () => {
    const rows = [];
    for (const f of page.frames()) {
      const r = await f.evaluate(() => (window.chart && Array.isArray(window.chart.data)
        ? { bars: window.chart.data.length, tf: window.chart.timeframe ?? null, isHost: window.top === window }
        : null)).catch(() => null);
      if (r) rows.push(r);
    }
    return rows;
  };
  const a = await snap();
  await sleep(20000);
  const b = await snap();
  report.advancement = a.map((r, i) => ({
    isHost: r.isHost,
    timeframe: r.tf,
    barsBefore: r.bars,
    barsAfter: b[i]?.bars ?? null,
    advanced: (b[i]?.bars ?? 0) - r.bars,
  }));
  report.advancingPanels = report.advancement.filter((r) => r.advanced > 0).length;
  report.advancementNote = 'Measured over 20 s. A panel on a slow timeframe can advance zero bars in a 20 s window and still be playing, so zero here is not by itself an eviction.';
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 600);
} finally {
  try { if (browser) await browser.disconnect(); } catch { /* gone */ }
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 3000));
