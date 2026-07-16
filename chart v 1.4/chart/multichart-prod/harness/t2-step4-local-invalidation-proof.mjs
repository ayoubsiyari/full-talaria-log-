#!/usr/bin/env node
/**
 * T2 step 4 — honest RC-2 local invalidation probe (I15).
 * redrawAll must schedule chart.render (not SVG-only) when local invalidation V2 ON.
 */
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout } from './harness-lib.mjs';

async function runProbe(page, localOn) {
  return page.evaluate(async (switchOn) => {
    window.__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2 = switchOn ? false : true;

    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!ch || !dm || !Array.isArray(ch.data) || ch.data.length < 100) {
      return { ok: false, reason: 'chart not ready' };
    }

    const idx = Math.floor(ch.data.length * 0.45);
    const y0 = Number(ch.data[idx]?.c);
    const toolInfo = dm.toolRegistry.trendline;
    if (!toolInfo?.class || !Number.isFinite(y0)) return { ok: false, reason: 'setup failed' };

    dm.drawings = dm.drawings.filter((d) => !String(d.id || '').startsWith('inv-probe-'));
    const drawing = toolInfo.class.fromJSON({
      type: 'trendline',
      points: [{ x: idx, y: y0 }, { x: idx + 20, y: y0 * 1.01 }],
      style: {},
    }, ch);
    drawing.id = `inv-probe-${Date.now()}`;
    drawing.chart = ch;
    dm.addDrawing(drawing);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const before = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
    dm.redrawAll({ forceFull: true });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;

    return {
      ok: true,
      localOn: switchOn,
      before,
      after,
      bumped: after > before,
      pass: switchOn ? (after > before) : !(after > before),
    };
  }, localOn);
}

async function main() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: false });
  try {
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    await boot.page.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 50, { timeout: 60000 });

    console.log('=== T2 step 4 local invalidation probe ===');
    const red = await runProbe(boot.page, false);
    console.log('RED path (switch OFF):', JSON.stringify(red, null, 2));
    if (!red.ok || !red.pass) {
      console.error('RED-CONFIRM failed');
      process.exit(1);
    }
    console.log('RED-CONFIRMED');

    const boot2 = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    const green = await runProbe(boot2.page, true);
    console.log('GREEN path (switch ON):', JSON.stringify(green, null, 2));
    if (!green.ok || !green.pass) {
      console.error('GREEN-CONFIRM failed');
      process.exit(1);
    }
    console.log('GREEN-CONFIRMED');
    console.log('FINAL T2-step4-local-invalidation PASS');
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
