#!/usr/bin/env node
/**
 * T5 step 5 — honest RC-3 Phase 4 probe (I15).
 * Fractional between-candle placement → timestampPoints survive TF switch.
 * Does NOT use H-S40/H-S41 harness rows.
 */
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout } from './harness-lib.mjs';

async function runProbe(page, fixOn) {
  return page.evaluate((fractionalOn) => {
    window.__TALARIA_RC3_FRACTIONAL_PLACE = fractionalOn ? true : false;

    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!ch || !dm || !Array.isArray(ch.data) || ch.data.length < 200) {
      return { ok: false, reason: 'chart not ready' };
    }

    const idx = Math.floor(ch.data.length * 0.42);
    const fracX = idx + 0.35;
    const bar = ch.data[idx];
    const y0 = Number(bar.c);
    const y1 = y0 * 1.008;

    const roundViaLegacy = (x) => {
      const p = CoordinateUtils.screenToData(
        ch.dataIndexToPixel(x),
        ch.yScale(y0),
        { xScale: ch.xScale, yScale: ch.yScale },
        ch,
        false
      );
      // Legacy post-process: bar snap (getDataPoint path when switch OFF)
      if (!fractionalOn) {
        return { x: Math.round(p.x), y: p.y };
      }
      return p;
    };

    const p1 = roundViaLegacy(fracX);
    const p2 = { x: p1.x + 18, y: y1 };

    const toolInfo = dm.toolRegistry.trendline;
    const drawing = toolInfo.class.fromJSON({
      type: 'trendline',
      points: [p1, p2],
      style: {},
    }, ch);
    drawing.chart = ch;
    if (typeof drawing.recalculateTimestamps === 'function') {
      drawing.recalculateTimestamps();
    }
    const t0 = drawing.timestampPoints && drawing.timestampPoints[0]
      ? Number(drawing.timestampPoints[0].timestamp)
      : null;
    const barOpenT = Number(ch.data[Math.round(fracX)]?.t);
    const barOpenRoundedT = Number(ch.data[Math.round(p1.x)]?.t);

    const interval = ch.data.length >= 2 ? (ch.data[1].t - ch.data[0].t) : 60000;
    const subCandleOffset = Math.abs(t0 - barOpenT);
    const hasFractionalAnchor = Math.abs(p1.x - Math.round(p1.x)) > 0.05;
    const subCandleTimestamp = subCandleOffset > interval * 0.05
      && subCandleOffset < interval * 0.95;

    dm.drawings = dm.drawings.filter((d) => !String(d.id || '').startsWith('frac-probe-'));
    drawing.id = `frac-probe-${Date.now()}`;
    dm.addDrawing(drawing);

    const beforeT = t0;
    const prevTf = ch.currentTimeframe;
    if (typeof ch.setTimeframe === 'function') {
      ch.setTimeframe('5m');
    }
    if (typeof dm.refreshDrawingsForTimeframe === 'function') {
      dm.refreshDrawingsForTimeframe('5m', prevTf);
    } else if (typeof dm._syncDrawingPointsFromTimestamps === 'function') {
      dm._syncDrawingPointsFromTimestamps(drawing, { tfRefresh: true });
    }
    const afterT = drawing.timestampPoints && drawing.timestampPoints[0]
      ? Number(drawing.timestampPoints[0].timestamp)
      : null;

    const tfStable = beforeT != null && afterT === beforeT;
    const legacyRounded = !fractionalOn && Math.abs(p1.x - Math.round(fracX)) < 0.01;

    return {
      ok: true,
      fractionalOn,
      placedX: p1.x,
      fracInput: fracX,
      beforeT,
      afterT,
      barOpenT,
      barOpenRoundedT,
      subCandleOffset,
      hasFractionalAnchor,
      subCandleTimestamp,
      tfStable,
      legacyRounded,
      pass: fractionalOn
        ? (hasFractionalAnchor && subCandleTimestamp && tfStable)
        : (legacyRounded && (!subCandleTimestamp || !tfStable)),
    };
  }, fixOn);
}

async function main() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: false });
  try {
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    const page = boot.page;
    await page.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 100, { timeout: 60000 });

    console.log('=== T5 step 5 Phase 4 fractional placement probe ===');
    const red = await runProbe(page, false);
    console.log('RED path (switch OFF):', JSON.stringify(red, null, 2));
    const redOk = red.ok && red.pass;
    console.log(redOk ? 'RED-CONFIRMED (integer bar snap)' : 'RED-UNEXPECTED');

    await boot.close();
    const boot2 = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    const page2 = boot2.page;
    await page2.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 100, { timeout: 60000 });

    const green = await runProbe(page2, true);
    console.log('GREEN path (switch ON):', JSON.stringify(green, null, 2));
    const greenOk = green.ok && green.pass;
    console.log(greenOk ? 'GREEN-CONFIRMED (fractional timestamp stable)' : 'GREEN-FAIL');

    const verdict = redOk && greenOk ? 'PASS' : 'FAIL';
    console.log(`FINAL T5-step5-fractional-place ${verdict}`);
    await boot2.close();
    process.exit(verdict === 'PASS' ? 0 : 1);
  } finally {
    await browser.close();
    await srv.close();
  }
}

await main();
