#!/usr/bin/env node
/**
 * T5 step 6 — honest RC-3 Phase 6 probe (I15).
 * Fib level labels re-sync X on pan hot-path; Gann labels use ray fraction not viewport bound.
 */
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout } from './harness-lib.mjs';

async function runProbe(page, switchOn) {
  return page.evaluate((labelOn) => {
    window.__TALARIA_RC3_LABEL_ANCHOR = labelOn ? true : false;

    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!ch || !dm || !Array.isArray(ch.data) || ch.data.length < 300) {
      return { ok: false, reason: 'chart not ready' };
    }

    const idx1 = Math.max(50, ch.data.length - 140);
    const idx2 = idx1 + 35;
    const y1 = Number(ch.data[idx1]?.c);
    const y2 = y1 * 0.985;

    const toolInfo = dm.toolRegistry['fibonacci-retracement'];
    if (!toolInfo?.class) return { ok: false, reason: 'fib tool missing' };

    dm.drawings = dm.drawings.filter((d) => !String(d.id || '').startsWith('lbl-probe-'));
    const drawing = toolInfo.class.fromJSON({
      type: 'fibonacci-retracement',
      points: [{ x: idx1, y: y1 }, { x: idx2, y: y2 }],
      style: { levelsEnabled: true, levelsLabelPosition: 'right' },
    }, ch);
    drawing.id = `lbl-probe-fib-${Date.now()}`;
    drawing.chart = ch;
    if (typeof drawing.recalculateTimestamps === 'function') {
      drawing.recalculateTimestamps();
    }
    dm.addDrawing(drawing);

    const scales = { xScale: ch.xScale, yScale: ch.yScale, chart: ch, labelsGroup: dm.labelsGroup };
    dm.renderDrawing(drawing, { skipInteraction: true });

    const readFibLabelSync = () => {
      const layout = BaseDrawing.computeTwoPointHorizontalFibLayout(drawing, scales);
      const labelNode = drawing.group && drawing.group.select('text[data-fib-label-idx]').node();
      if (!layout || !labelNode) return null;
      const labelX = parseFloat(labelNode.getAttribute('x'));
      const expect = fibHorizontalSpanLabelPlacement(drawing.style, layout.fibX1, layout.fibX2);
      const delta = Math.abs(labelX - expect.x);
      return { labelX, expectX: expect.x, delta, fibX2: layout.fibX2 };
    };

    if (typeof ch.panBy === 'function') {
      ch.offsetX = (ch.offsetX || 0) + 90;
      if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
    } else {
      ch.offsetX = (ch.offsetX || 0) + 90;
    }

    const patched = BaseDrawing.patchTwoPointHorizontalFib(drawing, scales);
    const sync = readFibLabelSync();
    if (!patched || !sync) return { ok: false, reason: 'patch or sync read failed', patched, sync };

    const gannInfo = dm.toolRegistry['gann-fan'];
    let gannUsesRay = null;
    if (gannInfo?.class) {
      const gann = gannInfo.class.fromJSON({
        type: 'gann-fan',
        points: [{ x: idx1, y: y1 }, { x: idx2, y: y2 * 1.06 }],
        style: { levelsEnabled: true },
      }, ch);
      gann.chart = ch;
      const gScales = { xScale: ch.xScale, yScale: ch.yScale, chart: ch };
      gann.render(dm.drawingsGroup, gScales, { reuseGroup: false });
      const layout = gannInfo.class._computeFanGeometry(gann.points, gann.style, gScales);
      const ray = layout && layout.rays && layout.rays.find((r) => Math.abs(r.value - 1) < 0.01);
      const labelNode = gann.group && gann.group.selectAll('text').nodes().find((n) => n && n.textContent);
      if (layout && ray && labelNode) {
        const lx = parseFloat(labelNode.getAttribute('x'));
        const ly = parseFloat(labelNode.getAttribute('y'));
        const dx = ray.end.x - layout.x1;
        const dy = ray.end.y - layout.y1;
        const along = (dx * dx + dy * dy) > 0
          ? ((lx - layout.x1) * dx + (ly - layout.y1) * dy) / (dx * dx + dy * dy)
          : NaN;
        gannUsesRay = Number.isFinite(along) && Math.abs(along - 0.35) < 0.06;
      }
    }

    const fibSynced = sync.delta < 2;
    const pass = labelOn
      ? (fibSynced && gannUsesRay !== false)
      : (!fibSynced || gannUsesRay === false);

    return {
      ok: true,
      labelOn,
      fibSynced,
      syncDelta: sync.delta,
      gannUsesRay,
      pass,
    };
  }, switchOn);
}

async function main() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: false });
  try {
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 1, tf: '1m' });
    await boot.page.waitForFunction(() => window.chart && window.chart.drawingManager
      && Array.isArray(window.chart.data) && window.chart.data.length > 100, { timeout: 60000 });

    console.log('=== T5 step 6 Phase 6 label anchor probe ===');
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
    console.log('FINAL T5-step6-label-anchor PASS');
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
