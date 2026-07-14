/**
 * T1 step 14 — legacy toolbar killed in real iframe panels via parent setV9PanelEmbed.
 * MANDATORY: built dist-v9 product (npm run build:live), NOT dev:live fast loop.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { panelFrameMap } from './harness-lib.mjs';
import { placeTool, installParentSettingsProbe } from './interactive-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_DIR = path.resolve(__dirname, '../../../talaria-design');
const DIST_INDEX = path.resolve(__dirname, '../../dist-v9/index.html');
const EVIDENCE_DIR = path.resolve(__dirname, '../../../../docs/tickets-overhaul/evidence');
const SCREENSHOT_PATH = path.join(EVIDENCE_DIR, 't1-step14-both-panels-v9-bar.png');

const HARNESS_PORT = Number(process.env.T1_STEP14_HARNESS_PORT || 8791);
const RUNS = Number(process.env.T1_STEP14_RUNS || 10);

function builtProductUrl(port = HARNESS_PORT) {
  const custom = process.env.T1_STEP14_BUILT_URL;
  if (custom) return custom;
  return `http://127.0.0.1:${port}/chart/dist-v9/index.html?mcLayout=2v`;
}

function probeUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, budgetMs = 120000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await probeUrl(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function spawnDetached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32',
  });
  child.unref();
  return child;
}

async function ensureHarness() {
  const harnessUrl = `http://127.0.0.1:${HARNESS_PORT}/api/auth/me`;
  if (await probeUrl(harnessUrl)) return;
  const servePath = path.join(__dirname, 'serve.mjs');
  spawnDetached(process.execPath, [servePath], {
    cwd: __dirname,
    env: { PORT: String(HARNESS_PORT) },
  });
  if (!(await waitForUrl(harnessUrl))) {
    throw new Error(`harness serve did not start on :${HARNESS_PORT}`);
  }
}

async function ensureBuiltDist() {
  if (!fs.existsSync(DIST_INDEX)) {
    throw new Error(`missing built dist-v9: ${DIST_INDEX} — run npm run build:live in talaria-design`);
  }
  const stat = fs.statSync(DIST_INDEX);
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs > 6 * 60 * 60 * 1000) {
    console.warn(`[step14] dist-v9/index.html is ${Math.round(ageMs / 60000)}m old — rebuild recommended`);
  }
}

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

async function ensureTwoPanelBuiltLayout(page) {
  await page.waitForFunction(() => window.chart && window.chart.drawingManager, { timeout: 180000 });
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
    const wrapFinish = (ok, detail) => { clearInterval(pollId); finish(ok, detail); };
    window.addEventListener('talaria:v9-quickbar-gear-ready', () => clearInterval(pollId), { once: true });
  }), drawingId, timeoutMs);
}

async function readToolbarState(page, frame = null) {
  if (frame) {
    const iframeState = await frame.evaluate(() => {
      const el = document.getElementById('drawing-toolbar');
      const r = el && el.getBoundingClientRect();
      return {
        embedFlag: window.__talariaV9PanelEmbed === true,
        buildId: window.__TALARIA_CHART_BUILD_ID || null,
        legacyVisible: !!(r && r.width > 0 && r.height > 0 && el.style.display !== 'none'),
        legacyKilled: !!(el && el.getAttribute('data-v9-legacy-toolbar-killed') === '1'),
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
        hostBuildId: window.__TALARIA_CHART_BUILD_ID || null,
        v9GearVisible: !!(gr && gr.width > 0 && gr.height > 0),
        v9BarVisible: !!(br && br.width > 0 && br.height > 0),
        parentLegacyVisible: !!(lr && lr.width > 0 && lr.height > 0),
      };
    });
    return { ...iframeState, ...parentV9 };
  }
  return page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    const gr = gear && gear.getBoundingClientRect();
    const legacy = document.getElementById('drawing-toolbar');
    const lr = legacy && legacy.getBoundingClientRect();
    const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
    const br = v9Bar && v9Bar.getBoundingClientRect();
    return {
      hostBuildId: window.__TALARIA_CHART_BUILD_ID || null,
      v9GearVisible: !!(gr && gr.width > 0 && gr.height > 0),
      v9BarVisible: !!(br && br.width > 0 && br.height > 0),
      legacyVisible: !!(lr && lr.width > 0 && lr.height > 0),
    };
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

async function runBuiltIframeOnce(page, runIndex, { captureScreenshot = false, switchOff = false } = {}) {
  await ensureTwoPanelBuiltLayout(page);
  const frameB = await waitForPanelFrame(page, 'B');
  if (!frameB) {
    return { ok: false, run: runIndex, phase: 'boot', detail: { reason: 'panel B iframe missing' } };
  }
  await frameB.waitForFunction(() => window.chart && window.chart.drawingManager, { timeout: 120000 });
  if (!switchOff) {
    await frameB.waitForFunction(() => window.__talariaV9PanelEmbed === true, { timeout: 30000 });
  }

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

  if (switchOff) {
    let legacyOk = bars.legacyVisible;
    if (!legacyOk) {
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        const retry = await readToolbarState(page, frameB);
        if (retry.legacyVisible) {
          legacyOk = true;
          Object.assign(bars, retry);
          break;
        }
      }
    }
    if (bars.embedFlag) {
      return { ok: false, run: runIndex, phase: 'switch-off-embed-flag', detail: bars };
    }
    if (!legacyOk) {
      return { ok: false, run: runIndex, phase: 'switch-off-legacy-missing', detail: { bars, ready } };
    }
    return { ok: true, run: runIndex, phase: 'switch-off-red', bars, surface: 'built-dist-v9' };
  }

  if (!bars.embedFlag) {
    return { ok: false, run: runIndex, phase: 'embed-flag', detail: bars };
  }
  if (bars.legacyVisible || bars.parentLegacyVisible) {
    return { ok: false, run: runIndex, phase: 'single-toolbar', detail: { bars, ready } };
  }
  if (!ready.ok && !bars.v9GearVisible && !bars.v9BarVisible) {
    return { ok: false, run: runIndex, phase: 'quickbar-ready', detail: { bars, ready } };
  }

  const click = await clickV9Gear(page);
  if (!click.ok) {
    return { ok: false, run: runIndex, phase: 'gear-click', detail: click };
  }
  const settings = await readParentSettingsState(page);
  if (!settings.open) {
    return { ok: false, run: runIndex, phase: 'settings-open', detail: settings };
  }

  if (captureScreenshot) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  }

  return {
    ok: true,
    run: runIndex,
    settleSignal: ready.detail?.signal,
    settings,
    bars,
    surface: 'built-dist-v9',
  };
}

async function main() {
  const switchOff = process.argv.includes('--switch-off');
  await ensureBuiltDist();
  await ensureHarness();

  const url = builtProductUrl();
  console.log(`[step14] built product URL: ${url}`);
  console.log(`[step14] verification surface: dist-v9 (NOT dev:live)`);

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

  let passes = 0;
  for (let i = 0; i < RUNS; i += 1) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });
    try {
      const r = await runBuiltIframeOnce(page, i + 1, { captureScreenshot: i === 0 && !switchOff, switchOff });
      if (r.ok) passes += 1;
      console.log(`built run ${i + 1}/${RUNS}: ${r.ok ? 'PASS' : 'FAIL'}${r.settleSignal ? ` (signal=${r.settleSignal})` : ''}`);
      if (r.bars) {
        console.log(`  panelB build=${r.bars.buildId} host build=${r.bars.hostBuildId} embedFlag=${r.bars.embedFlag}`);
      }
      if (!r.ok) console.log(JSON.stringify(r, null, 2));
    } catch (err) {
      console.log(`built run ${i + 1}/${RUNS}: FAIL`);
      console.log(JSON.stringify({ error: String(err && err.message || err) }, null, 2));
    }
  }

  await browser.close();
  console.log(`\nT1 step14 iframe legacy-toolbar kill (built product): ${passes}/${RUNS} (${switchOff ? 'switch OFF' : 'default ON'})`);
  if (passes === RUNS && !switchOff && fs.existsSync(SCREENSHOT_PATH)) {
    console.log(`screenshot: ${SCREENSHOT_PATH}`);
  }
  if (passes !== RUNS) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
