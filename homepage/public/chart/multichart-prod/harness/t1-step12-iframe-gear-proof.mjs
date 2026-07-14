/**
 * T1 step 12 — iframe panel B engine #tb-settings gear opens parent settings.
 * Fast-loop target: dev:live ?devMultichart=2v (T0 step 6).
 * Gated on talaria:iframe-toolbar-gear-ready — no fixed sleep before gear click.
 */
import puppeteer from 'puppeteer';
import { panelFrameMap, sleep } from './harness-lib.mjs';
import {
  placeTool,
  installParentSettingsProbe,
} from './interactive-helpers.mjs';

const BASE_URL = process.env.T1_STEP12_URL
  || 'http://127.0.0.1:5174/pricing/?devMultichart=2v&mode=backtest';
const RUNS = Number(process.env.T1_STEP12_RUNS || 10);

async function waitForPanelFrame(page, panelId = 'B') {
  await page.waitForFunction(
    (pid) => {
      try {
        return window.frames && Array.from(document.querySelectorAll('iframe')).some((f) => {
          const src = f.getAttribute('src') || '';
          return src.includes('chart-embed') && src.includes(`panelId=${pid}`);
        });
      } catch (_) {
        return false;
      }
    },
    { timeout: 120000 },
    panelId,
  );
  for (let i = 0; i < 40; i += 1) {
    const map = panelFrameMap(page);
    if (map[panelId]) return map[panelId];
    await new Promise((r) => setTimeout(r, 100));
  }
  return panelFrameMap(page)[panelId] || null;
}

async function ensureTwoPanelLayout(page) {
  await page.evaluate(() => {
    if (window.__multichartGrid) return 'grid-ready';
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div'));
    for (const el of candidates) {
      const t = (el.textContent || '').trim();
      if (t === '2' && el.closest('[data-dev-layout], [class*="dev"], [id*="dev"]')) {
        el.click();
        return 'clicked-dev-2';
      }
    }
    return 'no-dev-layout-control';
  });
  await page.waitForFunction(
    () => !!(window.__multichartGrid),
    { timeout: 90000 },
  );
  await waitForPanelFrame(page, 'B');
}

async function waitForGearReady(frame, drawingId, timeoutMs = 4000) {
  return frame.evaluate((drawId, timeout) => new Promise((resolve) => {
    const finish = (ok, detail) => resolve({ ok, detail });
    try {
      const cur = window.__talariaIframeToolbarGearReady;
      if (cur && drawId != null && String(cur.drawingId) === String(drawId)) {
        return finish(true, { signal: 'cached', ...cur });
      }
    } catch (_) { /* ignore */ }
    const timer = setTimeout(() => finish(false, { reason: 'timeout', signal: 'talaria:iframe-toolbar-gear-ready' }), timeout);
    const onReady = (ev) => {
      const d = ev && ev.detail;
      if (!d || drawId == null || String(d.drawingId) !== String(drawId)) return;
      clearTimeout(timer);
      window.removeEventListener('talaria:iframe-toolbar-gear-ready', onReady);
      finish(true, { signal: 'talaria:iframe-toolbar-gear-ready', ...d });
    };
    window.addEventListener('talaria:iframe-toolbar-gear-ready', onReady);
  }), drawingId, timeoutMs);
}

async function clickGearImmediate(frame) {
  return frame.evaluate(() => {
    const gear = document.getElementById('tb-settings');
    if (!gear) return { ok: false, reason: 'no #tb-settings' };
    const rect = gear.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, reason: 'gear not visible', rect: { w: rect.width, h: rect.height } };
    }
    gear.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return { ok: true, rect: { w: rect.width, h: rect.height } };
  });
}

async function readParentSettingsState(page) {
  return page.evaluate(() => {
    const root = document.getElementById('multichart-global-settings-root');
    const modal = document.querySelector('.tv-settings-modal');
    const open = !!(
      window.__harnessParentSettingsOpen
      || (root && root.childElementCount > 0)
      || (modal && modal.offsetParent !== null)
    );
    const text = String((root && root.innerText) || (modal && modal.innerText) || '').trim();
    return {
      open,
      textSnippet: text.slice(0, 240),
      hasTrendLine: /trend\s*line/i.test(text),
      hasStyleSection: /\bstyle\b/i.test(text),
    };
  });
}

async function runOnce(page, runIndex) {
  await ensureTwoPanelLayout(page);
  const frameB = await waitForPanelFrame(page, 'B');
  if (!frameB) {
    return { ok: false, run: runIndex, phase: 'boot', detail: { reason: 'panel B iframe missing' } };
  }

  await frameB.waitForFunction(
    () => window.chart && window.chart.drawingManager,
    { timeout: 120000 },
  );

  await page.evaluate(() => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.focusPanelById === 'function') grid.focusPanelById('B');
  });

  const placed = await placeTool(page, 'B', 'trendline', [
    { x: 30, y: 100 },
    { x: 50, y: 120 },
  ]);

  await frameB.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (!d) throw new Error(`drawing ${drawId} not found on panel B`);
    dm.selectDrawing(d, false);
  }, placed.id);

  const ready = await waitForGearReady(frameB, placed.id);
  if (!ready.ok) {
    const snap = await frameB.evaluate(() => {
      const dm = window.chart && window.chart.drawingManager;
      const gear = document.getElementById('tb-settings');
      const gr = gear && gear.getBoundingClientRect();
      return {
        toolbarVisible: !!(dm && dm.toolbar && dm.toolbar.visible),
        gearVisible: !!(gr && gr.width > 0 && gr.height > 0),
        selectedIds: dm ? (dm.selectedDrawings || []).map((d) => d && d.id) : [],
      };
    });
    return { ok: false, run: runIndex, phase: 'gear-ready', detail: { ready, snap } };
  }

  const click = await clickGearImmediate(frameB);
  if (!click.ok) {
    return { ok: false, run: runIndex, phase: 'gear-click', detail: click };
  }

  const settings = await readParentSettingsState(page);
  if (!settings.open) {
    return { ok: false, run: runIndex, phase: 'settings-open', detail: settings };
  }

  return {
    ok: true,
    run: runIndex,
    settleSignal: ready.detail && ready.detail.signal,
    settings,
  };
}

async function main() {
  const switchOff = process.argv.includes('--switch-off');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  if (switchOff) {
    await page.evaluateOnNewDocument(() => {
      window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true;
    });
  }

  await installParentSettingsProbe(page);
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 180000 });

  let passes = 0;
  const results = [];
  for (let i = 0; i < RUNS; i += 1) {
    if (i > 0) {
      await page.reload({ waitUntil: 'networkidle2', timeout: 180000 });
    }
    try {
      const r = await runOnce(page, i + 1);
      results.push(r);
      if (r.ok) passes += 1;
      console.log(`run ${i + 1}/${RUNS}: ${r.ok ? 'PASS' : 'FAIL'}${r.settleSignal ? ` (signal=${r.settleSignal})` : ''}`);
      if (!r.ok) console.log(JSON.stringify(r, null, 2));
    } catch (err) {
      const r = { ok: false, run: i + 1, phase: 'exception', error: String(err && err.message || err) };
      results.push(r);
      console.log(`run ${i + 1}/${RUNS}: FAIL`);
      console.log(JSON.stringify(r, null, 2));
    }
  }

  await browser.close();
  console.log(`\nT1 step12 iframe panel B gear: ${passes}/${RUNS} (${switchOff ? 'switch OFF' : 'default ON'})`);
  if (passes !== RUNS) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
