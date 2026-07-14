/**
 * T1 step 13 — exactly one V9 quick-bar; its gear opens settings (no legacy engine toolbar).
 * Modes: iframe panel B (multichart 2v) + single-chart host tile A.
 * Gated on talaria:v9-quickbar-gear-ready + parent #tl-sett visible — no fixed sleep.
 */
import puppeteer from 'puppeteer';
import { panelFrameMap } from './harness-lib.mjs';
import { placeTool, installParentSettingsProbe } from './interactive-helpers.mjs';

const MULTICHART_URL = process.env.T1_STEP13_MC_URL
  || 'http://127.0.0.1:5174/pricing/?devMultichart=2v&mode=backtest';
const SINGLE_URL = process.env.T1_STEP13_SINGLE_URL
  || 'http://127.0.0.1:5174/pricing/?mode=backtest';
const RUNS = Number(process.env.T1_STEP13_RUNS || 10);

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
  await page.waitForFunction(() => !!(window.__multichartGrid), { timeout: 90000 });
  await waitForPanelFrame(page, 'B');
}

async function waitForQuickBarReady(page, drawingId, timeoutMs = 5000) {
  return page.evaluate((drawId, timeout) => new Promise((resolve) => {
    const finish = (ok, detail) => resolve({ ok, detail });
    const matches = (d) => d && drawId != null && String(d.drawingId) === String(drawId);
    try {
      const cur = window.__talariaV9QuickBarGearReady;
      if (matches(cur)) return finish(true, { signal: 'cached', ...cur });
    } catch (_) { /* ignore */ }
    const timer = setTimeout(() => finish(false, { reason: 'timeout', signal: 'talaria:v9-quickbar-gear-ready' }), timeout);
    const onReady = (ev) => {
      const d = ev && ev.detail;
      if (!matches(d)) return;
      clearTimeout(timer);
      window.removeEventListener('talaria:v9-quickbar-gear-ready', onReady);
      finish(true, { signal: 'talaria:v9-quickbar-gear-ready', ...d });
    };
    window.addEventListener('talaria:v9-quickbar-gear-ready', onReady);
    const poll = () => {
      const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
      const gr = gear && gear.getBoundingClientRect();
      const legacy = document.getElementById('drawing-toolbar');
      const lr = legacy && legacy.getBoundingClientRect();
      const legacyVisible = !!(lr && lr.width > 0 && lr.height > 0 && legacy.style.display !== 'none');
      const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
      const v9BarRect = v9Bar && v9Bar.getBoundingClientRect();
      const v9BarVisible = !!(v9BarRect && v9BarRect.width > 0 && v9BarRect.height > 0);
      const v9Visible = !!(gr && gr.width > 0 && gr.height > 0) || v9BarVisible;
      if (v9Visible && !legacyVisible) {
        clearTimeout(timer);
        window.removeEventListener('talaria:v9-quickbar-gear-ready', onReady);
        finish(true, { signal: 'dom-poll', v9Visible, legacyVisible });
      }
    };
    const pollId = setInterval(poll, 16);
    const cleanup = () => clearInterval(pollId);
    const wrapFinish = (ok, detail) => { cleanup(); finish(ok, detail); };
    window.addEventListener('talaria:v9-quickbar-gear-ready', () => cleanup(), { once: true });
  }), drawingId, timeoutMs);
}

async function readToolbarState(page, frame = null) {
  if (frame) {
    const iframeLegacy = await frame.evaluate(() => {
      const el = document.getElementById('drawing-toolbar');
      const r = el && el.getBoundingClientRect();
      return {
        legacyVisible: !!(r && r.width > 0 && r.height > 0),
        toolbarVisible: !!(window.chart?.drawingManager?.toolbar?.visible),
      };
    });
    const parentV9 = await page.evaluate(() => {
      const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
      const gr = gear && gear.getBoundingClientRect();
      const legacy = document.getElementById('drawing-toolbar');
      const lr = legacy && legacy.getBoundingClientRect();
      const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
      const br = v9Bar && v9Bar.getBoundingClientRect();
      return {
        v9GearVisible: !!(gr && gr.width > 0 && gr.height > 0),
        v9BarVisible: !!(br && br.width > 0 && br.height > 0),
        parentLegacyVisible: !!(lr && lr.width > 0 && lr.height > 0),
      };
    });
    return { ...iframeLegacy, ...parentV9 };
  }
  return page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    const gr = gear && gear.getBoundingClientRect();
    const legacy = document.getElementById('drawing-toolbar');
    const lr = legacy && legacy.getBoundingClientRect();
    const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
    const br = v9Bar && v9Bar.getBoundingClientRect();
    return {
      v9GearVisible: !!(gr && gr.width > 0 && gr.height > 0),
      v9BarVisible: !!(br && br.width > 0 && br.height > 0),
      legacyVisible: !!(lr && lr.width > 0 && lr.height > 0),
      toolbarVisible: !!(window.chart?.drawingManager?.toolbar?.visible),
    };
  });
}

async function clickV9Gear(page) {
  return page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    if (!gear) return { ok: false, reason: 'no #tl-sett' };
    const rect = gear.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, reason: 'v9 gear not visible', rect: { w: rect.width, h: rect.height } };
    }
    gear.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return { ok: true };
  });
}

async function readParentSettingsState(page) {
  return page.evaluate(() => {
    const root = document.getElementById('multichart-global-settings-root');
    const modal = document.querySelector('.tv-settings-modal');
    const tlSett = document.querySelector('[data-v9-tlsett], [class*="tlSett"], #tlsett-panel');
    const open = !!(
      window.__harnessParentSettingsOpen
      || (root && root.childElementCount > 0)
      || (modal && modal.offsetParent !== null)
      || (tlSett && tlSett.offsetParent !== null)
    );
    const text = String((root && root.innerText) || (modal && modal.innerText) || document.body.innerText || '').trim();
    return {
      open,
      textSnippet: text.slice(0, 240),
      hasTrendLine: /trend\s*line/i.test(text),
      hasStyleSection: /\bstyle\b/i.test(text),
    };
  });
}

async function runIframeOnce(page, runIndex) {
  await ensureTwoPanelLayout(page);
  const frameB = await waitForPanelFrame(page, 'B');
  if (!frameB) {
    return { ok: false, mode: 'iframe', run: runIndex, phase: 'boot', detail: { reason: 'panel B iframe missing' } };
  }
  await frameB.waitForFunction(() => window.chart && window.chart.drawingManager, { timeout: 120000 });
  await page.evaluate(() => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.focusPanelById === 'function') grid.focusPanelById('B');
  });
  const placed = await placeTool(page, 'B', 'trendline', [{ x: 30, y: 100 }, { x: 50, y: 120 }]);
  await frameB.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (!d) throw new Error(`drawing ${drawId} not found on panel B`);
    dm.selectDrawing(d, false);
  }, placed.id);

  const ready = await waitForQuickBarReady(page, placed.id);
  const bars = await readToolbarState(page, frameB);
  if (bars.legacyVisible || bars.parentLegacyVisible) {
    return { ok: false, mode: 'iframe', run: runIndex, phase: 'single-toolbar', detail: { bars, ready } };
  }
  if (!ready.ok && !bars.v9GearVisible && !bars.v9BarVisible) {
    return { ok: false, mode: 'iframe', run: runIndex, phase: 'quickbar-ready', detail: { bars, ready } };
  }

  const click = await clickV9Gear(page);
  if (!click.ok) {
    return { ok: false, mode: 'iframe', run: runIndex, phase: 'gear-click', detail: click };
  }
  const settings = await readParentSettingsState(page);
  if (!settings.open) {
    return { ok: false, mode: 'iframe', run: runIndex, phase: 'settings-open', detail: settings };
  }
  return { ok: true, mode: 'iframe', run: runIndex, settleSignal: ready.detail?.signal, settings, bars };
}

async function runSingleOnce(page, runIndex) {
  await page.waitForFunction(() => window.chart && window.chart.drawingManager, { timeout: 120000 });
  const placed = await placeTool(page, 'A', 'trendline', [{ x: 30, y: 100 }, { x: 50, y: 120 }]);
  await page.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (!d) throw new Error(`drawing ${drawId} not found`);
    dm.selectDrawing(d, false);
  }, placed.id);

  const ready = await waitForQuickBarReady(page, placed.id);
  const bars = await readToolbarState(page);
  if (bars.legacyVisible) {
    return { ok: false, mode: 'single', run: runIndex, phase: 'single-toolbar', detail: { bars, ready } };
  }
  if (!ready.ok && !bars.v9GearVisible && !bars.v9BarVisible) {
    return { ok: false, mode: 'single', run: runIndex, phase: 'quickbar-ready', detail: { bars, ready } };
  }

  const click = await clickV9Gear(page);
  if (!click.ok) {
    return { ok: false, mode: 'single', run: runIndex, phase: 'gear-click', detail: click };
  }
  const settings = await readParentSettingsState(page);
  if (!settings.open) {
    return { ok: false, mode: 'single', run: runIndex, phase: 'settings-open', detail: settings };
  }
  return { ok: true, mode: 'single', run: runIndex, settleSignal: ready.detail?.signal, settings, bars };
}

async function main() {
  const switchOff = process.argv.includes('--switch-off');
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'both';
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

  const modes = mode === 'both' ? ['iframe', 'single'] : [mode];
  let passes = 0;
  const total = RUNS * modes.length;

  for (const m of modes) {
    const url = m === 'iframe' ? MULTICHART_URL : SINGLE_URL;
    for (let i = 0; i < RUNS; i += 1) {
      if (i > 0 || m !== modes[0]) {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });
      } else {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });
      }
      try {
        const r = m === 'iframe' ? await runIframeOnce(page, i + 1) : await runSingleOnce(page, i + 1);
        if (r.ok) passes += 1;
        console.log(`${m} run ${i + 1}/${RUNS}: ${r.ok ? 'PASS' : 'FAIL'}${r.settleSignal ? ` (signal=${r.settleSignal})` : ''}`);
        if (!r.ok) console.log(JSON.stringify(r, null, 2));
      } catch (err) {
        console.log(`${m} run ${i + 1}/${RUNS}: FAIL`);
        console.log(JSON.stringify({ mode: m, error: String(err && err.message || err) }, null, 2));
      }
    }
  }

  await browser.close();
  console.log(`\nT1 step13 duplicate-toolbar gear: ${passes}/${total} (${switchOff ? 'switch OFF' : 'default ON'}, modes=${modes.join(',')})`);
  if (passes !== total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
