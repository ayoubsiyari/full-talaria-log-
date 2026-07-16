#!/usr/bin/env node
/**
 * T5 step 4 — honest RC-3 Phase 3 probe (I15).
 * Copy trendline → prepend history (index shift) → paste.
 * Measures pasted drawing.timestampPoints[0].timestamp (wall-clock), not bar index.
 */
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout } from './harness-lib.mjs';

async function runProbe(page, rc3On) {
  return page.evaluate((fixOn) => {
    window.__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET = fixOn ? true : false;

    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!ch || !dm || !Array.isArray(ch.data) || ch.data.length < 120) {
      return { ok: false, reason: 'chart not ready' };
    }
    const data = ch.data;
    const interval = data.length >= 2 ? (data[1].t - data[0].t) : 60000;
    const idx = Math.floor(data.length * 0.45);
    const bar = data[idx];
    const y0 = Number(bar.c);
    const y1 = y0 * 1.01;
    const pts = [{ x: idx, y: y0 }, { x: idx + 25, y: y1 }];
    const tsPts = CoordinateUtils.pointsToTimestamps(pts, data, ch.currentTimeframe);

    const toolInfo = dm.toolRegistry.trendline;
    const drawing = toolInfo.class.fromJSON({
      type: 'trendline',
      coordinateSystem: 'timestamp',
      points: tsPts.map((p) => ({ timestamp: p.timestamp, price: p.price })),
      style: {},
    }, ch);
    drawing.id = `probe-${Date.now()}`;
    drawing.points = pts;
    drawing.timestampPoints = tsPts;
    dm.drawings = dm.drawings.filter((d) => !String(d.id || '').startsWith('probe-'));
    dm.addDrawing(drawing);

    const srcT0 = Number(tsPts[0].timestamp);
    const srcIdx = idx;

    dm.copyDrawing(drawing);
    const clipSys = dm.clipboardDrawing && dm.clipboardDrawing.coordinateSystem;

    const prependCount = 40;
    const prependBars = [];
    for (let i = prependCount; i >= 1; i--) {
      prependBars.push({
        t: data[0].t - i * interval,
        o: y0, h: y0, l: y0, c: y0, v: 1,
      });
    }
    ch.data = prependBars.concat(data);
    if (typeof dm._syncDrawingPointsFromTimestamps === 'function') {
      dm._syncDrawingPointsFromTimestamps(drawing, { tfRefresh: true });
    }
    const idxAfterPrepend = Number(drawing.points[0].x);

    const beforeCount = dm.drawings.length;
    dm.pasteDrawing();
    const pasted = dm.drawings[dm.drawings.length - 1];
    if (!pasted || dm.drawings.length <= beforeCount) {
      return { ok: false, reason: 'paste failed' };
    }

    const pastedT0 = pasted.timestampPoints && pasted.timestampPoints[0]
      ? Number(pasted.timestampPoints[0].timestamp)
      : null;
    const pastedIdx = pasted.points && pasted.points[0]
      ? Number(pasted.points[0].x)
      : null;
    const expectedT = srcT0 + 3 * interval;
    const timestampAnchored = pastedT0 === expectedT;
    const staleIndexPaste = Number.isFinite(pastedIdx)
      && Math.abs(pastedIdx - (srcIdx + 3)) < 0.01
      && Math.abs(idxAfterPrepend - srcIdx) > 0.5;

    return {
      ok: true,
      fixOn,
      clipSys,
      srcT0,
      srcIdx,
      idxAfterPrepend,
      pastedT0,
      pastedIdx,
      expectedT,
      timestampAnchored,
      staleIndexPaste,
      pass: fixOn ? timestampAnchored : staleIndexPaste && !timestampAnchored,
    };
  }, rc3On);
}

async function main() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: false });
  try {
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    const page = boot.page;
    await page.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 100, { timeout: 60000 });

    console.log('=== T5 step 4 Phase 3 paste probe (prepend index shift) ===');
    const red = await runProbe(page, false);
    console.log('RED path (switch OFF):', JSON.stringify(red, null, 2));
    const redOk = red.ok && red.pass;
    console.log(redOk ? 'RED-CONFIRMED (legacy stale index paste)' : 'RED-UNEXPECTED');

    await boot.close();
    const boot2 = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    const page2 = boot2.page;
    await page2.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 100, { timeout: 60000 });

    const green = await runProbe(page2, true);
    console.log('GREEN path (switch ON):', JSON.stringify(green, null, 2));
    const greenOk = green.ok && green.pass;
    console.log(greenOk ? 'GREEN-CONFIRMED (timestamp offset paste)' : 'GREEN-FAIL');

    const verdict = redOk && greenOk ? 'PASS' : 'FAIL';
    console.log(`FINAL T5-step4-paste-timestamp ${verdict}`);
    await boot2.close();
    process.exit(verdict === 'PASS' ? 0 : 1);
  } finally {
    await browser.close();
    await srv.close();
  }
}

await main();
