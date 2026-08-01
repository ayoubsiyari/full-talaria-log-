#!/usr/bin/env node
/**
 * Is the zero-trade arm running four panels or one?
 *
 * Bar-count advance read 1 of 4 over 20 s. That is the exact false-void trap my own conf01-session documents:
 * a panel on a slow timeframe closes a bar rarely, so data.length can sit still while the panel is playing
 * normally. The honest test is the simulated PLAYHEAD, which moves continuously, plus the render counter.
 *
 * This decides whether the zero-trade profile is a CONF-01 measurement or a one-panel measurement, which in
 * turn decides whether its function shares are comparable to the with-trades freezes I dissected.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser } from './lib/find-soak-port.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\PLAYHEAD-ADVANCE-20260801.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { signature: 'PLAYHEAD-ADVANCE-V1', at: new Date().toISOString(), bfcacheState: 'default (enabled) — read-only attach.' };

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  const found = await findSoakBrowser();
  if (!found) throw new Error('no live browser with a chart page');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${found.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];

  const snap = async () => {
    const rows = [];
    for (const f of page.frames()) {
      const r = await f.evaluate(() => {
        const ch = window.chart;
        if (!ch) return null;
        const rs = ch.replaySystem;
        return {
          isHost: window.top === window,
          symbol: ch.symbol ?? null,
          tf: ch.timeframe ?? ch.interval ?? ch.currentTimeframe ?? null,
          bars: Array.isArray(ch.data) ? ch.data.length : null,
          // Several playhead spellings exist across builds; take whichever is finite.
          playhead: [rs?.replayTimestamp, rs?.currentTime, rs?.replayIndex, rs?.currentIndex, rs?.playbackIndex]
            .map(Number).find((v) => Number.isFinite(v)) ?? null,
          isActive: !!(rs && rs.isActive),
          isPlaying: !!(rs && (rs.isPlaying ?? rs.playing)),
          lastPrice: Array.isArray(ch.data) && ch.data.length ? (ch.data[ch.data.length - 1]?.close ?? null) : null,
        };
      }).catch(() => null);
      if (r) rows.push(r);
    }
    return rows;
  };

  const a = await snap();
  await sleep(25000);
  const b = await snap();
  report.frames = a.map((r, i) => {
    const q = b[i] || {};
    const playheadMoved = r.playhead != null && q.playhead != null && q.playhead !== r.playhead;
    const priceMoved = r.lastPrice != null && q.lastPrice != null && q.lastPrice !== r.lastPrice;
    return {
      isHost: r.isHost,
      symbol: r.symbol,
      timeframe: r.tf,
      barsBefore: r.bars,
      barsAfter: q.bars ?? null,
      barsAdvanced: (q.bars ?? 0) - (r.bars ?? 0),
      playheadBefore: r.playhead,
      playheadAfter: q.playhead ?? null,
      playheadMoved,
      lastBarPriceMoved: priceMoved,
      isActive: r.isActive,
      isPlaying: r.isPlaying,
      // A panel is LIVE if anything about it moved: a new bar, the playhead, or the forming bar's price.
      live: (q.bars ?? 0) - (r.bars ?? 0) > 0 || playheadMoved || priceMoved,
    };
  });
  const live = report.frames.filter((f) => f.live).length;
  const byBars = report.frames.filter((f) => f.barsAdvanced > 0).length;
  report.verdict = {
    frames: report.frames.length,
    liveByAnySignal: live,
    liveByBarCountOnly: byBars,
    windowSec: 25,
    reading: live === report.frames.length
      ? `ALL ${live} panels are live. Bar count alone would have said ${byBars} of ${report.frames.length} and produced a false void: the slow-timeframe panels advance their playhead and their forming bar without closing one inside a 25 s window.`
      : `${live} of ${report.frames.length} panels are live by ANY signal (bars, playhead or forming-bar price). The arm is NOT a four-panel CONF-01 measurement and its function shares are not comparable to the four-panel freezes.`,
  };
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 600);
} finally {
  try { if (browser) await browser.disconnect(); } catch { /* gone */ }
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ frames: report.frames, verdict: report.verdict, error: report.error }, null, 1));
