#!/usr/bin/env node
/**
 * UI-CONTACT-SHEET-V1 — B5 of the overnight battery (ruling 776923bde).
 *
 * The PO asked about drawing-tool icons, windows and button design. Those need human eyes, so
 * this makes the eyes cheap: sweep the UI unattended, shoot every control in default and active
 * state on both single chart and multichart, and assemble ONE contact sheet the PO can scan in
 * five minutes instead of clicking for an hour.
 *
 * Design decisions that matter for it being useful rather than a pile of PNGs:
 *  - Controls are DISCOVERED from the live DOM (role/aria/title/class), not from a hardcoded
 *    list, so tools nobody remembered still get photographed.
 *  - Every shot is CROPPED to the control's neighbourhood as well as captured full-page, because
 *    a 1600x1000 screenshot of a 24px icon tells the PO nothing about the icon.
 *  - The single-chart sweep runs at first paint, before the layout is switched to four panels, so
 *    both surfaces come from one session and neither needs a second window claim.
 *  - Nothing here measures performance, so it is safe to run beside nothing and it cannot
 *    contaminate a dataset (NIGHT-01: no synthetic writers).
 */
import fs from 'node:fs';
import path from 'node:path';

import { bootConf01Session } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeControlsSource() {
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title')
    || el.getAttribute('data-tool') || el.getAttribute('data-testid')
    || (el.textContent || '').trim().slice(0, 28) || el.className?.toString?.().slice(0, 28) || 'unlabelled');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.05) return false;
    return r.top > -50 && r.left > -50 && r.top < innerHeight + 50 && r.left < innerWidth + 50;
  };
  // The first sweep's toolbar and replay-control groups came back empty because these selectors
  // were guessed from class-name patterns and the V9 bundle does not use them. The IDs below are
  // read out of the shipped bundle, so they match what actually renders.
  const groups = [
    { group: 'drawing-tools', selector: '[data-tool], .drawing-tool, [class*="drawing"] button, [class*="tool-button"], [aria-label*="tool" i], #crosshair, #brush, #brush2, #channel, #drawingsSyncToolbarBtn' },
    { group: 'toolbar', selector: '#chartSymbol, #chartTimeframe, #chartChange, #chart-container > button, [class*="toolbar"] button, [class*="topbar"] button, header button' },
    { group: 'replay-controls', selector: '#replayToolbar, #replayToolbar button, #replayToolbar select, #replayToolbarHandle, #replayModeBtn, #replayPlaybackMode, #replayTimeframe, #replayFollow, .replay-follow-float-btn' },
    { group: 'settings-and-panels', selector: '#tl-sett, #txt-sett, #vb-sett, #vpb-sett, #avb-sett, #avb-more, #avb-lock, #avb-del, [aria-label*="setting" i], [title*="setting" i], [class*="gear"], [class*="settings"] button' },
    { group: 'orders', selector: '#tl-rr-order, [class*="order"] button, [aria-label*="order" i], [class*="position"] button' },
    { group: 'indicators', selector: '[aria-label*="indicator" i], [title*="indicator" i], [class*="indicator"] button' },
    { group: 'titled-controls', selector: '[title]:not([title=""])' },
  ];
  const out = [];
  const seen = new Set();
  for (const { group, selector } of groups) {
    let els = [];
    try { els = [...document.querySelectorAll(selector)]; } catch { els = []; }
    for (const el of els) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      el.setAttribute('data-sheet-id', `s${out.length}`);
      out.push({
        id: `s${out.length}`,
        group,
        label: label(el),
        tag: el.tagName.toLowerCase(),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
      if (out.length >= 90) return out;
    }
  }
  return out;
}

async function shoot(page, file, clip) {
  try {
    await page.screenshot({ path: file, clip, captureBeyondViewport: false });
    return fs.existsSync(file) ? +(fs.statSync(file).size / 1024).toFixed(1) : 0;
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  }
}

/** Pads a control's rect so the shot shows the icon in its context, clamped to the viewport. */
function padded(rect, vw, vh, pad = 26) {
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x, y,
    width: Math.min(vw - x, rect.w + pad * 2),
    height: Math.min(vh - y, rect.h + pad * 2),
  };
}

async function sweepSurface(page, outDir, surface, shots) {
  const vp = page.viewport() || { width: 1600, height: 1000 };
  const full = path.join(outDir, `${surface}-00-full.png`);
  const kb = await shoot(page, full);
  shots.push({ surface, kind: 'full-page', label: `${surface}: full page, default state`, file: path.basename(full), kb });

  const controls = await page.evaluate(describeControlsSource).catch(() => []);
  console.error(`[b5] ${surface}: ${controls.length} visible controls discovered`);

  for (const c of controls) {
    const base = `${surface}-${c.id}-${c.group}`.replace(/[^\w.-]/g, '_');
    const clip = padded(c.rect, vp.width, vp.height);
    const dflt = path.join(outDir, `${base}-default.png`);
    shots.push({
      surface, kind: 'control-default', group: c.group, label: `${c.group}: ${c.label} (default)`,
      file: path.basename(dflt), kb: await shoot(page, dflt, clip),
    });

    // Active state: click it, shoot the whole page (a panel may open anywhere), then dismiss.
    let activated = false;
    try {
      await page.evaluate((id) => {
        const el = document.querySelector(`[data-sheet-id="${id}"]`);
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, c.id);
      activated = true;
      await sleep(450);
    } catch { /* control vanished */ }
    if (activated) {
      const act = path.join(outDir, `${base}-active.png`);
      shots.push({
        surface, kind: 'control-active', group: c.group, label: `${c.group}: ${c.label} (ACTIVE / opened)`,
        file: path.basename(act), kb: await shoot(page, act),
      });
      try {
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
          document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
        });
      } catch { /* ignore */ }
      await sleep(220);
    }
  }

  // Context menu on the chart canvas: right-click is a surface the PO explicitly mentioned.
  try {
    const canvas = await page.$('canvas');
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await sleep(500);
        const ctx = path.join(outDir, `${surface}-context-menu.png`);
        shots.push({
          surface, kind: 'context-menu', group: 'context-menus',
          label: `${surface}: right-click context menu on the chart`,
          file: path.basename(ctx), kb: await shoot(page, ctx),
        });
        await page.keyboard.press('Escape');
      }
    }
  } catch { /* ignore */ }
  return controls.length;
}

function contactSheetHtml(shots, meta) {
  const byGroup = new Map();
  for (const s of shots) {
    const g = `${s.surface} · ${s.group || s.kind}`;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(s);
  }
  const sections = [...byGroup.entries()].map(([g, list]) => `
    <h2>${g} <span class="n">${list.length}</span></h2>
    <div class="grid">
      ${list.map((s) => `<figure><img src="${s.file}" loading="lazy"><figcaption>${s.label}</figcaption></figure>`).join('')}
    </div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Talaria UI contact sheet ${meta.date}</title>
<style>
 :root { color-scheme: dark; }
 body { background:#0d1117; color:#e6edf3; font:14px/1.5 -apple-system,Segoe UI,system-ui,sans-serif; margin:0; padding:28px 32px 80px; }
 h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.01em; }
 .meta { color:#8b949e; font-size:12px; margin-bottom:26px; }
 h2 { font-size:13px; text-transform:uppercase; letter-spacing:.09em; color:#7ee787; margin:34px 0 12px; border-bottom:1px solid #21262d; padding-bottom:7px; }
 h2 .n { color:#484f58; margin-left:6px; }
 .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
 figure { margin:0; background:#161b22; border:1px solid #21262d; border-radius:8px; overflow:hidden; }
 figure img { display:block; width:100%; background:#0d1117; }
 figcaption { font-size:11px; color:#8b949e; padding:7px 9px; border-top:1px solid #21262d; word-break:break-word; }
</style>
<h1>Talaria UI contact sheet</h1>
<div class="meta">build <b>${meta.build}</b> · ${meta.date} · ${shots.length} shots · single chart and four-panel multichart · captured unattended by UI-CONTACT-SHEET-V1</div>
${sections}`;
}

export async function runUiContactSheet({ outPath = null } = {}) {
  const outDir = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ui-sheet-20260731';
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    signature: 'UI-CONTACT-SHEET-V1',
    startedAtIso: new Date().toISOString(),
    ruling: '776923bde B5',
    outDir,
    shots: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  const singleSweep = async (page) => {
    // First paint of a single chart, before the layout switch: the PO's default surface.
    await sleep(2_500);
    report.singleChartControls = await sweepSurface(page, outDir, 'single-chart', report.shots);
    // The replay toolbar (#replayToolbar and its mode, timeframe and follow controls) is not in
    // the DOM until replay mode is entered, which is why the first sweep returned an empty
    // replay-controls group. Enter it, then sweep again so those controls are in the sheet.
    report.replayEntry = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { ok: false, why: 'no replay system' };
      try {
        if (typeof rs.enterReplayMode === 'function') rs.enterReplayMode({ startAtBeginning: false });
        else if (typeof rs.enterReplay === 'function') rs.enterReplay();
        else return { ok: false, why: 'no enterReplayMode' };
      } catch (e) { return { ok: false, why: String(e.message).slice(0, 90) }; }
      return { ok: true };
    }).catch((e) => ({ ok: false, why: String(e?.message || e).slice(0, 90) }));
    await sleep(4_000);
    const toolbarPresent = await page.evaluate(() => !!document.querySelector('#replayToolbar')).catch(() => false);
    report.replayToolbarPresentAfterEntry = toolbarPresent;
    if (toolbarPresent) {
      report.replayControls = await sweepSurface(page, outDir, 'single-chart-replay', report.shots);
    }
    save();
  };

  const { browser, page, cdp } = await bootConf01Session({
    replaySpeed: 60,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
    onSingleReady: singleSweep,
  });
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return s ? s[1] : null;
    }).catch(() => null);
    report.modePerRealm = [];
    for (const frame of page.frames()) {
      try {
        const m = await frame.evaluate(() => {
          const rs = window.chart && window.chart.replaySystem;
          return rs && typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null;
        });
        if (m) report.modePerRealm.push(m);
      } catch { /* gone */ }
    }
    console.error(`[b5] build=${report.build} modePerRealm=${JSON.stringify(report.modePerRealm)}`);

    report.multichartControls = await sweepSurface(page, outDir, 'multichart-4panel', report.shots);
    save();

    const htmlPath = path.join(outDir, 'CONTACT-SHEET.html');
    fs.writeFileSync(htmlPath, contactSheetHtml(report.shots, {
      build: report.build, date: '2026-07-31',
    }));
    report.contactSheetHtml = htmlPath;

    // Render the sheet to a single PNG so the PO can flick through one image on a phone.
    const sheetPage = await browser.newPage();
    await sheetPage.setViewport({ width: 1500, height: 1200 });
    await sheetPage.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load', timeout: 60_000 });
    await sleep(3_000);
    const png = path.join(outDir, 'CONTACT-SHEET.png');
    await sheetPage.screenshot({ path: png, fullPage: true }).catch((e) => {
      report.contactSheetPngError = String(e?.message || e).slice(0, 140);
    });
    report.contactSheetPng = fs.existsSync(png) ? png : null;
    report.contactSheetPngKb = report.contactSheetPng ? +(fs.statSync(png).size / 1024).toFixed(1) : 0;
    await sheetPage.close().catch(() => {});

    report.verdict = {
      shots: report.shots.length,
      failedShots: report.shots.filter((s) => s.kb && s.kb.error).length,
      singleChartControls: report.singleChartControls ?? 0,
      multichartControls: report.multichartControls ?? 0,
      contactSheetHtml: report.contactSheetHtml,
      contactSheetPng: report.contactSheetPng,
      answer: `${report.shots.length} shots across ${(report.singleChartControls ?? 0) + (report.multichartControls ?? 0)} controls; open CONTACT-SHEET.html (or .png) in ${outDir}`,
    };
    console.error(`[b5] VERDICT ${report.verdict.answer}`);
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /ui-contact-sheet\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runUiContactSheet(parseArgs(process.argv.slice(2)));
