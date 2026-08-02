#!/usr/bin/env node
/**
 * C02-PAIRSWITCH-PANE-MEASURE-V1
 *
 * Prices CompareOverlay linked panes against the PAIR SWITCH event rather than
 * against pane teardown (which E already priced at -53.72 MB total private).
 *
 * Two questions, answered separately:
 *   1. Does a pair switch walk the panes? Census of linkedPanes, their canvases
 *      and their data overlap with the newly loaded pair, taken across switches.
 *   2. If it does not, what would binding release to the switch be worth? The
 *      panes are released immediately after a switch and the arena delta is read.
 *
 * A control arm switches pairs with no panes present so switch-alone drift is
 * quotable next to the release delta. Samples follow the E method: forced CDP
 * collection, then OS private memory (total / renderer / GPU); canvas backing
 * size is recorded only as a geometry cross-check and is NOT the price.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { bootLayout, embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const MB = 1048576;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argOf(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function mb(bytes) {
  return bytes == null ? null : +(Number(bytes) / MB).toFixed(3);
}

function delta(a, b) {
  return (a == null || b == null) ? null : +(Number(a) - Number(b)).toFixed(3);
}

function log(...args) {
  console.error(`[c02-pairswitch ${new Date().toISOString()}]`, ...args);
}

function chartFrames(page) {
  return [page.mainFrame(), ...embedFrames(page)];
}

async function collectGarbage(page, cdp) {
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await cdp.send('Runtime.collectGarbage').catch(() => {});
    await page.evaluate(() => { try { if (typeof gc === 'function') gc(); } catch (_) {} }).catch(() => {});
    await sleep(300);
  }
  await sleep(1000);
}

async function readPerf(cdp) {
  const got = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const get = (name) => {
    const row = got.metrics.find((m) => m.name === name);
    return row ? Number(row.value) : null;
  };
  return {
    jsHeapUsedMB: mb(get('JSHeapUsedSize')),
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    documents: get('Documents'),
  };
}

async function readProcesses(browser) {
  const bcdp = await browser.target().createCDPSession();
  try {
    const info = await bcdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
    const rows = info.processInfo || [];
    const footprints = await readOsFootprints(rows.map((p) => p.id)).catch(() => ({}));
    const processes = rows.map((p) => ({
      pid: p.id,
      type: p.type,
      privateMB: footprints[p.id]?.privateMB ?? null,
    }));
    const sumWhere = (re) => +processes
      .filter((p) => re.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    return {
      totalPrivateMB: +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      rendererPrivateMB: sumWhere(/renderer/i),
      gpuPrivateMB: sumWhere(/gpu/i),
      processes,
    };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

/** Per-frame census: what the panes are, and whether they still describe the loaded pair. */
async function censusFrame(frame) {
  return frame.evaluate(() => {
    const ch = window.chart;
    const overlay = ch && ch.compareOverlay;
    const panes = Array.isArray(overlay?.linkedPanes) ? overlay.linkedPanes : [];
    const range = (rows) => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const first = Number(rows[0]?.t ?? rows[0]?.time);
      const last = Number(rows[rows.length - 1]?.t ?? rows[rows.length - 1]?.time);
      return (Number.isFinite(first) && Number.isFinite(last)) ? { first, last } : null;
    };
    const mainRange = range(ch?.data);
    const paneRows = panes.map((p) => {
      const canvas = document.getElementById(`linkedPane_${p.id}`);
      const wrapper = document.getElementById(`linkedPaneWrapper_${p.id}`);
      const pr = range(p.data);
      let overlapMs = null;
      if (pr && mainRange) {
        overlapMs = Math.max(0, Math.min(pr.last, mainRange.last) - Math.max(pr.first, mainRange.first));
      }
      return {
        id: String(p.id),
        symbol: p.symbol || null,
        paneFileId: p.fileId != null ? String(p.fileId) : null,
        bars: Array.isArray(p.data) ? p.data.length : 0,
        hasCanvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0,
        backingMB: canvas ? +((canvas.width * canvas.height * 4) / 1048576).toFixed(3) : 0,
        wrapperAttached: !!(wrapper && wrapper.isConnected),
        listenerDisposers: Array.isArray(p._listenerDisposers) ? p._listenerDisposers.length : null,
        overlapMs,
      };
    });
    const allPaneCanvases = [...document.querySelectorAll('canvas[id^="linkedPane_"]')];
    return {
      chartFileId: ch?.currentFileId != null ? String(ch.currentFileId) : null,
      chartSymbol: ch?.currentSymbol || null,
      mainRange,
      paneCount: panes.length,
      panes: paneRows,
      // Canvases in the DOM whose pane is gone from the model would be orphans.
      paneCanvasesInDom: allPaneCanvases.length,
      orphanPaneCanvases: allPaneCanvases
        .filter((c) => !panes.some((p) => `linkedPane_${p.id}` === c.id))
        .map((c) => ({ id: c.id, w: c.width, h: c.height })),
      paneBackingMB: +allPaneCanvases
        .reduce((s, c) => s + ((c.width * c.height * 4) / 1048576), 0).toFixed(3),
      containerPresent: !!document.querySelector('[id^="linkedPanesContainer_"]'),
      totalCanvases: document.querySelectorAll('canvas').length,
    };
  }).catch((error) => ({ error: String(error?.message || error) }));
}

async function census(page) {
  const perFrame = [];
  for (const frame of chartFrames(page)) perFrame.push(await censusFrame(frame));
  const sum = (k) => +perFrame.reduce((s, f) => s + (Number(f[k]) || 0), 0).toFixed(3);
  return {
    frames: perFrame.length,
    paneCount: sum('paneCount'),
    paneCanvasesInDom: sum('paneCanvasesInDom'),
    paneBackingMB: sum('paneBackingMB'),
    totalCanvases: sum('totalCanvases'),
    orphanPaneCanvases: perFrame.reduce((s, f) => s + (f.orphanPaneCanvases?.length || 0), 0),
    perFrame,
  };
}

async function sample(label, ctx) {
  await collectGarbage(ctx.page, ctx.cdp);
  if (ctx.settleMs > 0) {
    // Native allocators decommit lazily: partition_alloc and malloc can hold
    // freed spans well past the collection that released them, so a reading
    // taken immediately after GC can show a reclaim that has not reached the OS
    // yet. Wait, then collect again, then read.
    await sleep(ctx.settleMs);
    await collectGarbage(ctx.page, ctx.cdp);
  }
  const [perf, proc, counts] = await Promise.all([
    readPerf(ctx.cdp),
    readProcesses(ctx.browser),
    census(ctx.page),
  ]);
  const row = {
    label,
    at: new Date().toISOString(),
    perf,
    process: {
      totalPrivateMB: proc.totalPrivateMB,
      rendererPrivateMB: proc.rendererPrivateMB,
      gpuPrivateMB: proc.gpuPrivateMB,
    },
    counts,
  };
  log(`sample ${label} total=${proc.totalPrivateMB} gpu=${proc.gpuPrivateMB} renderer=${proc.rendererPrivateMB} panes=${counts.paneCount} paneCanvases=${counts.paneCanvasesInDom}`);
  return row;
}

async function ensureCompareOverlay(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async () => {
      const chart = window.chart;
      if (!chart) return { ok: false, reason: 'no chart' };
      if (chart.compareOverlay && typeof chart.compareOverlay.renderLinkedPanes === 'function') {
        return { ok: true, alreadyPresent: true };
      }
      if (typeof window.CompareOverlay !== 'function') {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/chart/modules/compare-overlay.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('failed to load compare-overlay.js'));
            document.head.appendChild(s);
          });
        } catch (e) {
          return { ok: false, reason: `script inject failed: ${e?.message || e}` };
        }
      }
      if (typeof window.CompareOverlay !== 'function') return { ok: false, reason: 'CompareOverlay undefined' };
      try {
        chart.compareOverlay = new window.CompareOverlay(chart);
      } catch (e) {
        return { ok: false, reason: `ctor failed: ${e?.message || e}` };
      }
      return { ok: !!chart.compareOverlay, alreadyPresent: false };
    }).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  return rows;
}

/** Same pane shape E used in arena-reclaim-measure, so the two prices are comparable. */
async function addLinkedPanes(page) {
  const frames = chartFrames(page);
  const rows = [];
  for (let i = 0; i < frames.length; i++) {
    rows.push(await frames[i].evaluate((panelIndex) => {
      const chart = window.chart;
      const overlay = chart && chart.compareOverlay;
      if (!chart || !overlay || typeof overlay.renderLinkedPanes !== 'function') {
        return { ok: false, reason: 'missing compareOverlay.renderLinkedPanes' };
      }
      overlay.linkedPanes = [];
      overlay.setupLinkedPanesContainer();
      const src = Array.isArray(chart.data) && chart.data.length ? chart.data : [];
      const data = src.slice(-600).map((bar, idx) => ({
        t: bar.t || bar.time || idx,
        o: Number(bar.o ?? bar.open ?? 1) + panelIndex * 0.01,
        h: Number(bar.h ?? bar.high ?? 1.001) + panelIndex * 0.01,
        l: Number(bar.l ?? bar.low ?? 0.999) + panelIndex * 0.01,
        c: Number(bar.c ?? bar.close ?? 1) + panelIndex * 0.01,
        v: Number(bar.v ?? bar.volume ?? 100),
      }));
      const pane = {
        id: Date.now() + panelIndex,
        fileId: 9000 + panelIndex,
        symbol: `C02PANE${panelIndex}`,
        color: overlay.colors[panelIndex % overlay.colors.length],
        rawData: data,
        rawFetchTf: chart.currentTimeframe || '1m',
        nativeBarMs: 60000,
        data,
        visible: true,
        height: '50%',
        yMin: Math.min(...data.map((b) => b.l)),
        yMax: Math.max(...data.map((b) => b.h)),
        priceZoom: 1,
        priceOffset: 0,
        autoScale: true,
        displayType: 'candles',
        upColor: '#089981',
        downColor: '#f23645',
        showBody: true,
        showBorder: true,
        showWick: true,
        showPriceLine: true,
      };
      overlay.linkedPanes.push(pane);
      overlay.renderLinkedPanes();
      return {
        ok: true,
        paneId: String(pane.id),
        bars: data.length,
        paneCanvases: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
      };
    }, i).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  await sleep(1200);
  return rows;
}

async function removeLinkedPanes(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(() => {
      const overlay = window.chart && window.chart.compareOverlay;
      if (!overlay || typeof overlay.removeLinkedPane !== 'function') {
        return { ok: false, reason: 'missing removeLinkedPane' };
      }
      const panes = Array.isArray(overlay.linkedPanes) ? overlay.linkedPanes.slice() : [];
      for (const pane of panes) overlay.removeLinkedPane(pane.id);
      return {
        ok: true,
        removed: panes.length,
        remaining: Array.isArray(overlay.linkedPanes) ? overlay.linkedPanes.length : 0,
        paneCanvases: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
      };
    }).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  await sleep(1200);
  return rows;
}

async function switchAllPanels(page, targetFileId) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async (fid) => {
      const ch = window.chart;
      if (!ch || typeof ch.loadFileData !== 'function') return { ok: false, reason: 'missing loadFileData' };
      const overlay = ch.compareOverlay;
      const before = {
        fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
        paneCount: Array.isArray(overlay?.linkedPanes) ? overlay.linkedPanes.length : 0,
        paneCanvases: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
      };
      await ch.loadFileData(String(fid));
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return {
        ok: true,
        before,
        after: {
          fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
          paneCount: Array.isArray(overlay?.linkedPanes) ? overlay.linkedPanes.length : 0,
          paneCanvases: document.querySelectorAll('canvas[id^="linkedPane_"]').length,
        },
      };
    }, targetFileId).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  await sleep(800);
  return rows;
}

async function main() {
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-A', `c02-pairswitch-pane-${Date.now()}.json`)));
  const hostFile = argOf('host-file', '25');
  const targetFile = argOf('target-file', '27');
  const settleMs = Number(argOf('settle', '0')) || 0;
  // A ~40 MB GPU transient peaks between 30s and 90s after load and is gone by
  // 120s. The boot and creation samples previously landed inside it, which is
  // part of why the release delta would not resolve. Sit out the hump first.
  const warmupMs = Number(argOf('warmup', '0')) || 0;
  const report = {
    signature: 'C02-PAIRSWITCH-PANE-MEASURE-V1',
    at: new Date().toISOString(),
    method: {
      surface: 'harness host.html, four panels, same-pair boot',
      event: `pair switch via chart.loadFileData(): ${hostFile} -> ${targetFile} on every panel`,
      memory: 'forced CDP collection then OS private memory; total/renderer/GPU private are the price, canvas backing is a cross-check only',
      arms: [
        'panesPresent: panes added, measured before the switch',
        'afterSwitchRetained: same panes, measured after the switch with no release (answers: does the switch walk the panes)',
        'afterReleaseAtSwitch: panes released at that point (delta from previous = what binding release to pair switch would buy)',
        'controlSwitchNoPanes: a second switch with no panes, for switch-alone drift',
      ],
    },
    inputs: { hostFile, targetFile, panels: 4, settleMs },
    operations: {},
    samples: {},
  };
  const save = (phase) => {
    report.partial = phase || null;
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    log(`wrote ${phase || 'done'}`);
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  log(`artifact=${out}`);

  const srv = await startServer(0);
  let browser = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 240_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
      ],
      defaultViewport: { width: 1440, height: 960 },
    });
    report.browser = { version: await browser.version(), serverUrl: srv.url };
    log(`browser ${report.browser.version} server ${srv.url}`);

    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m', hostFile: Number(hostFile) });
    const { page } = boot;
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});
    await sleep(1000);
    const ctx = { page, cdp, browser, settleMs };
    if (warmupMs > 0) {
      log(`warmup ${warmupMs}ms before the first sample, to clear the post-load GPU transient`);
      await sleep(warmupMs);
    }

    report.operations.ensureCompareOverlay = await ensureCompareOverlay(page);
    report.samples.boot = await sample('boot', ctx);
    save('boot');

    report.operations.addLinkedPanes = await addLinkedPanes(page);
    log(`addLinkedPanes=${JSON.stringify(report.operations.addLinkedPanes)}`);
    report.samples.panesPresent = await sample('panesPresent', ctx);
    save('panesPresent');

    report.operations.switchWithPanes = await switchAllPanels(page, targetFile);
    log(`switchWithPanes=${JSON.stringify(report.operations.switchWithPanes)}`);
    report.samples.afterSwitchRetained = await sample('afterSwitchRetained', ctx);
    save('afterSwitchRetained');

    report.operations.removeLinkedPanes = await removeLinkedPanes(page);
    log(`removeLinkedPanes=${JSON.stringify(report.operations.removeLinkedPanes)}`);
    report.samples.afterReleaseAtSwitch = await sample('afterReleaseAtSwitch', ctx);
    save('afterReleaseAtSwitch');

    report.operations.controlSwitch = await switchAllPanels(page, hostFile);
    report.samples.controlSwitchNoPanes = await sample('controlSwitchNoPanes', ctx);

    const s = report.samples;
    const p = (k, m) => s[k]?.process?.[m] ?? null;
    report.summary = {
      switchWalksThePanes: s.afterSwitchRetained?.counts?.paneCount === 0
        && s.panesPresent?.counts?.paneCount > 0,
      panesBeforeSwitch: s.panesPresent?.counts?.paneCount ?? null,
      panesAfterSwitch: s.afterSwitchRetained?.counts?.paneCount ?? null,
      paneCanvasesAfterSwitch: s.afterSwitchRetained?.counts?.paneCanvasesInDom ?? null,
      orphanPaneCanvasesAfterSwitch: s.afterSwitchRetained?.counts?.orphanPaneCanvases ?? null,
      paneBackingAfterSwitchMB: s.afterSwitchRetained?.counts?.paneBackingMB ?? null,
      releaseAtSwitch: {
        totalPrivateMB: delta(p('afterSwitchRetained', 'totalPrivateMB'), p('afterReleaseAtSwitch', 'totalPrivateMB')),
        rendererPrivateMB: delta(p('afterSwitchRetained', 'rendererPrivateMB'), p('afterReleaseAtSwitch', 'rendererPrivateMB')),
        gpuPrivateMB: delta(p('afterSwitchRetained', 'gpuPrivateMB'), p('afterReleaseAtSwitch', 'gpuPrivateMB')),
        paneBackingMB: delta(s.afterSwitchRetained?.counts?.paneBackingMB, s.afterReleaseAtSwitch?.counts?.paneBackingMB),
      },
      switchAloneDrift: {
        totalPrivateMB: delta(p('afterReleaseAtSwitch', 'totalPrivateMB'), p('controlSwitchNoPanes', 'totalPrivateMB')),
        gpuPrivateMB: delta(p('afterReleaseAtSwitch', 'gpuPrivateMB'), p('controlSwitchNoPanes', 'gpuPrivateMB')),
      },
      paneCostAtCreation: {
        totalPrivateMB: delta(p('panesPresent', 'totalPrivateMB'), p('boot', 'totalPrivateMB')),
        gpuPrivateMB: delta(p('panesPresent', 'gpuPrivateMB'), p('boot', 'gpuPrivateMB')),
      },
    };
    report.partial = null;
    save(null);
    await cdp.detach().catch(() => {});
    await boot.close();
  } catch (error) {
    report.error = String((error && error.stack) || error);
    process.exitCode = 1;
    log(`ERROR ${report.error}`);
    try { save('error'); } catch (_) {}
  } finally {
    try { await browser?.close?.(); } catch (_) {}
    try { await srv.close?.(); } catch (_) {}
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ artifact: out, error: report.error || null, summary: report.summary || null }, null, 2));
  }
}

await main();
