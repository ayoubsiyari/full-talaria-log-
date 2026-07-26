/**
 * §23.3 short browser cell for the exact-tail painted endpoint ledger.
 * Harness-only: same product bytes and inputs, default ON versus explicit OFF.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './harness-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(here, '..', '..');
const perfSource = fs.readFileSync(path.join(chartRoot, 'modules', 'indicator-performance.js'), 'utf8');
const indicatorsSource = fs.readFileSync(path.join(chartRoot, 'modules', 'chart-indicators-full.js'), 'utf8');
const KILL = '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1';

async function runArm(browser, explicitOff) {
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument((key, disabled) => {
      if (disabled) window[key] = true;
      else delete window[key];
    }, KILL, explicitOff);
    await page.goto('data:text/html,<meta charset="utf-8"><title>m23-3</title>');
    await page.evaluate(() => { window.Chart = function Chart() {}; });
    await page.addScriptTag({ content: perfSource });
    await page.addScriptTag({ content: indicatorsSource });
    return await page.evaluate((kill, isOff) => {
      const bars = Array.from({ length: 300 }, (_, i) => ({
        t: 1700000000000 + i * 60000,
        o: 100 + i * 0.01, h: 101 + i * 0.01,
        l: 99 + i * 0.01, c: 100.5 + i * 0.01, v: 1000 + i,
      }));
      const chart = Object.create(window.Chart.prototype);
      chart.data = bars;
      chart.dataVersion = 1;
      chart.currentTimeframe = '1m';
      chart.indicators = {
        active: [{ id: 'wma20', type: 'wma', params: { period: 20 }, overlay: true }],
        data: { wma20: new Array(bars.length).fill(null) },
      };
      chart._runIndicatorRecalc = () => {};
      chart.scheduleRender = () => {};
      chart.updateOHLCIndicators = () => {};
      chart._invalidateIndicatorLayerCache = () => {};
      const before = {
        version: chart._indicatorRenderVersion || 0,
        value: chart.indicators.data.wma20.at(-1),
      };
      const returned = chart._m19iExactTailPaint();
      return {
        arm: isOff ? 'explicit-OFF' : 'default-ON',
        indicatorPerfLoaded: typeof window.IndicatorPerf?.mergeIndicatorTailWindow === 'function',
        killReadback: window[kill],
        returned,
        before,
        after: {
          version: chart._indicatorRenderVersion || 0,
          value: chart.indicators.data.wma20.at(-1),
          lastFp: chart._m19iExactTailLastFp ?? null,
          lastRv: chart._m19iExactTailLastRv ?? null,
          stats: chart._m19iB62Stats ? { ...chart._m19iB62Stats } : null,
        },
      };
    }, KILL, explicitOff);
  } finally {
    await page.close();
  }
}

const browser = await launchBrowser({ headful: false });
try {
  const on = await runArm(browser, false);
  const off = await runArm(browser, true);
  assert.equal(on.indicatorPerfLoaded, true);
  assert.equal(off.indicatorPerfLoaded, true);
  assert.equal(on.killReadback, undefined);
  assert.equal(off.killReadback, true);
  assert.equal(on.returned, true, JSON.stringify(on));
  assert.equal(on.after.stats?.exactTailPaints, 1);
  assert.equal(on.after.version - on.before.version, 1);
  assert.ok(on.after.lastFp);
  assert.equal(on.after.lastRv, on.after.version);
  assert.equal(off.returned, false);
  assert.equal(off.after.stats, null);
  assert.equal(off.after.version - off.before.version, 0);
  assert.equal(off.after.lastFp, null);
  assert.notEqual(on.after.value, off.after.value);
  assert.equal(globalThis[KILL], undefined, 'runner must restore default state');
  process.stdout.write(`${JSON.stringify({
    verdict: 'PASS', switch: KILL, defaultRestored: true, on, off,
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
