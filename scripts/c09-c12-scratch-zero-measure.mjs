#!/usr/bin/env node
/**
 * C09-C12-SCRATCH-ZERO-MEASURE-V1
 *
 * Prices "zero the scratch canvas before dropping it" for the screenshot /
 * compositing scratch sites (C09-C12 of the canvas lifecycle matrix).
 *
 * The product change under test is two lines (`canvas.width = 0; canvas.height = 0`
 * after the last read), so the arms are run from the probe instead: both arms call
 * the same product path, and only the treatment arm zeroes before dropping the
 * reference. No product edit is needed to price it.
 *
 * Arms alternate A/B/A/B so ordering drift cannot be mistaken for effect. Two
 * readings per burst:
 *   - transient: private memory immediately after the burst with NO forced
 *     collection. This is where zeroing can help: a canvas backing store is
 *     native memory that V8 has no pressure signal for, so an unreachable
 *     canvas can sit un-reclaimed until an unrelated collection.
 *   - settled: private memory after forced collection. If the two arms agree
 *     here, zeroing buys peak only, not floor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { bootLayout, embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { acquireRunLockOrExit, writeArtifactAtomic } from './lib/run-lock.mjs';

const MB = 1048576;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argOf(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function mb(bytes) {
  return bytes == null ? null : +(Number(bytes) / MB).toFixed(3);
}

function log(...args) {
  console.error(`[c09-c12 ${new Date().toISOString()}]`, ...args);
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

async function readProcesses(browser) {
  const bcdp = await browser.target().createCDPSession();
  try {
    const info = await bcdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
    const rows = info.processInfo || [];
    const footprints = await readOsFootprints(rows.map((p) => p.id)).catch(() => ({}));
    const processes = rows.map((p) => ({ pid: p.id, type: p.type, privateMB: footprints[p.id]?.privateMB ?? null }));
    const sumWhere = (re) => +processes.filter((p) => re.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    return {
      totalPrivateMB: +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      rendererPrivateMB: sumWhere(/renderer/i),
      gpuPrivateMB: sumWhere(/gpu/i),
    };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

async function readJsHeap(cdp) {
  const got = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const row = got.metrics.find((m) => m.name === 'JSHeapUsedSize');
  return row ? mb(row.value) : null;
}

async function ensureScreenshotManager(page) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async () => {
      if (!window.chart) return { ok: false, reason: 'no chart' };
      // A classic-script `class X {}` binds in the global lexical scope, not on
      // window, so resolve by identifier before falling back to an inject.
      const resolveCtor = () => {
        if (typeof ScreenshotManager !== 'undefined' && typeof ScreenshotManager === 'function') return ScreenshotManager;
        if (typeof window.ScreenshotManager === 'function') return window.ScreenshotManager;
        return null;
      };
      let Ctor = resolveCtor();
      if (!Ctor && !window.screenshotManager) {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/chart/modules/screenshot-manager.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('load failed'));
            document.head.appendChild(s);
          });
        } catch (e) {
          return { ok: false, reason: `inject failed: ${e?.message || e}` };
        }
        Ctor = resolveCtor();
      }
      try {
        window.__c09Probe = window.__c09Probe
          || (Ctor ? new Ctor(window.chart) : null)
          || window.screenshotManager
          || null;
      } catch (e) {
        return { ok: false, reason: `ctor failed: ${e?.message || e}` };
      }
      if (!window.__c09Probe) return { ok: false, reason: 'ScreenshotManager unresolved (absent from tree or failed to load)' };
      if (typeof window.__c09Probe.captureCanvasDirect !== 'function') {
        return { ok: false, reason: 'probe present but captureCanvasDirect missing' };
      }
      const container = document.getElementById('chart-container')
        || document.querySelector('.chart-wrapper')
        || document.getElementById('chartWrapper');
      const r = container ? container.getBoundingClientRect() : null;
      return {
        ok: !!(window.__c09Probe && container),
        hasCaptureDirect: typeof window.__c09Probe?.captureCanvasDirect === 'function',
        hasComposite: typeof window.__c09Probe?.captureMultichartComposite === 'function',
        hasGrid: !!document.querySelector('[data-multichart-grid]'),
        containerW: r ? Math.round(r.width) : null,
        containerH: r ? Math.round(r.height) : null,
        scratchMBPerCapture: r ? +(((r.width * 2) * (r.height * 2) * 4) / 1048576).toFixed(3) : null,
      };
    }).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  return rows;
}

/**
 * One burst: `captures` screenshot composites per frame through the real product
 * path, dropping the result. `zero` selects the treatment arm.
 */
async function burst(page, captures, zero, productPath) {
  const rows = [];
  for (const frame of chartFrames(page)) {
    rows.push(await frame.evaluate(async (n, doZero, useProduct) => {
      const sm = window.__c09Probe;
      const container = document.getElementById('chart-container')
        || document.querySelector('.chart-wrapper')
        || document.getElementById('chartWrapper');
      if (!sm || !container) return { ok: false, reason: 'probe or container missing' };
      let bytes = 0;
      let scratchMB = 0;
      let made = 0;
      const t0 = performance.now();

      if (useProduct) {
        // Bind the arms to the LANDED product path: the only difference between
        // them is the kill switch, so a green here is the shipped bytes, not a
        // probe-side shim.
        window.__TALARIA_DISABLE_SCRATCH_CANVAS_RELEASE_V1 = !doZero;
        if (typeof sm.captureChartSnapshot !== 'function') {
          return { ok: false, reason: 'captureChartSnapshot absent' };
        }
        const r = container.getBoundingClientRect();
        for (let i = 0; i < n; i++) {
          const url = await sm.captureChartSnapshot();
          if (!url) continue;
          made += 1;
          scratchMB += (r.width * r.height * 4) / 1048576; // scale=1 on this path
          bytes += url.length;
        }
        return {
          ok: true,
          captures: made,
          nominalScratchMB: +scratchMB.toFixed(3),
          dataUrlBytes: bytes,
          killSwitch: !!window.__TALARIA_DISABLE_SCRATCH_CANVAS_RELEASE_V1,
          releaseHelperPresent: typeof sm._releaseScratchCanvas === 'function',
          elapsedMs: Math.round(performance.now() - t0),
        };
      }

      for (let i = 0; i < n; i++) {
        const canvas = await sm.captureCanvasDirect(container, 2);
        if (!canvas) continue;
        made += 1;
        scratchMB += (canvas.width * canvas.height * 4) / 1048576;
        let url = '';
        try { url = canvas.toDataURL('image/jpeg', 0.7); } catch (_) {}
        bytes += url.length;
        if (doZero) {
          // The change under test: release the backing store at the last read
          // rather than leaving it to an unrelated collection.
          try { canvas.width = 0; canvas.height = 0; } catch (_) {}
        }
        url = '';
      }
      return {
        ok: true,
        captures: made,
        nominalScratchMB: +scratchMB.toFixed(3),
        dataUrlBytes: bytes,
        elapsedMs: Math.round(performance.now() - t0),
      };
    }, captures, zero, productPath).catch((error) => ({ ok: false, reason: String(error?.message || error) })));
  }
  return rows;
}

async function runArm(label, { page, cdp, browser, productPath }, captures, zero) {
  await collectGarbage(page, cdp);
  const baseline = { ...await readProcesses(browser), jsHeapMB: await readJsHeap(cdp) };
  const ops = await burst(page, captures, zero, productPath);
  // No collection here on purpose: this is the transient reading.
  await sleep(500);
  const transient = { ...await readProcesses(browser), jsHeapMB: await readJsHeap(cdp) };
  await collectGarbage(page, cdp);
  const settled = { ...await readProcesses(browser), jsHeapMB: await readJsHeap(cdp) };
  const nominalScratchMB = +ops.reduce((s, r) => s + (Number(r.nominalScratchMB) || 0), 0).toFixed(3);
  const capturesMade = ops.reduce((s, r) => s + (Number(r.captures) || 0), 0);
  if (capturesMade === 0) {
    // Anti-vacuity: with no capture performed, any arm difference is drift and
    // must not be published as a saving.
    throw new Error(`GATE_VACUOUS: arm ${label} performed 0 captures — ${JSON.stringify(ops)}`);
  }
  const row = {
    label,
    zero,
    captures,
    capturesMade,
    nominalScratchMB,
    baseline,
    transient,
    settled,
    transientRiseMB: +(transient.totalPrivateMB - baseline.totalPrivateMB).toFixed(3),
    settledRiseMB: +(settled.totalPrivateMB - baseline.totalPrivateMB).toFixed(3),
    ops,
  };
  log(`${label} zero=${zero} nominalScratch=${nominalScratchMB}MB transientRise=${row.transientRiseMB}MB settledRise=${row.settledRiseMB}MB`);
  return row;
}

function mean(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return +(nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(3);
}

async function main() {
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-A', `c09-c12-scratch-zero-${Date.now()}.json`)));
  const captures = Number(argOf('captures', '8')) || 8;
  const cycles = Number(argOf('cycles', '2')) || 2;
  const order = argOf('order', 'AB') === 'BA' ? 'BA' : 'AB';
  const productPath = argOf('path','probe') === 'product';
  const singleArm = ['A', 'B'].includes(argOf('arm', '')) ? argOf('arm', '') : null;
  const lock = acquireRunLockOrExit({
    artifact: out,
    script: 'c09-c12-scratch-zero-measure.mjs',
    allowConcurrent: process.argv.includes('--allow-concurrent'),
  });
  const report = {
    signature: 'C09-C12-SCRATCH-ZERO-MEASURE-V1',
    at: new Date().toISOString(),
    runLock: { state: lock.state, pid: process.pid },
    method: {
      surface: 'harness host.html, four panels',
      path: 'ScreenshotManager.captureCanvasDirect(container, 2) then toDataURL, per frame — the C10 scratch site',
      arms: 'A = product today (drop the reference), B = width=0/height=0 before drop; alternated A/B/A/B',
      readings: 'transient = immediately after burst with no forced collection; settled = after forced collection',
    },
    inputs: { captures, cycles, order, singleArm, path: productPath ? 'product' : 'probe' },
    arms: [],
  };
  const save = (phase) => {
    report.partial = phase || null;
    writeArtifactAtomic(out, JSON.stringify(report, null, 2));
  };
  log(`artifact=${out}`);

  const srv = await startServer(0);
  let browser = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 300_000,
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
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m', hostFile: 25 });
    const { page } = boot;
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});
    await sleep(1000);
    const ctx = { page, cdp, browser, productPath };

    report.setup = await ensureScreenshotManager(page);
    log(`setup=${JSON.stringify(report.setup)}`);
    save('setup');

    // Only the FIRST arm sees a clean boot baseline. Once an arm has grown the
    // process the allocator reuses that space, so later arms saturate and their
    // rises are not comparable. Order is therefore a run parameter, and the
    // first-arm reading is the one that is quoted.
    if (singleArm) {
      // Cleanest design: one arm per fresh browser. No ordering effect, no
      // allocator saturation from a previous burst, one clean baseline.
      const zero = singleArm === 'B';
      report.arms.push(await runArm(`${zero ? 'B-zeroed' : 'A-product'}-solo`, ctx, captures, zero));
      save('solo');
    }
    for (let c = 0; !singleArm && c < cycles; c++) {
      const seq = order === 'BA' ? [true, false] : [false, true];
      for (const zero of seq) {
        report.arms.push(await runArm(`${zero ? 'B-zeroed' : 'A-product'}-c${c}`, ctx, captures, zero));
        save(`${zero ? 'B' : 'A'}-c${c}`);
      }
    }

    const armA = report.arms.filter((a) => !a.zero);
    const armB = report.arms.filter((a) => a.zero);
    const first = report.arms[0];
    report.summary = {
      order,
      firstArmFromCleanBaseline: first ? {
        arm: first.label,
        zero: first.zero,
        baselineTotalMB: first.baseline.totalPrivateMB,
        transientRiseMB: first.transientRiseMB,
        settledRiseMB: first.settledRiseMB,
      } : null,
      nominalScratchPerBurstMB: mean(report.arms.map((a) => a.nominalScratchMB)),
      product: {
        transientRiseMB: mean(armA.map((a) => a.transientRiseMB)),
        settledRiseMB: mean(armA.map((a) => a.settledRiseMB)),
        runs: armA.map((a) => a.transientRiseMB),
      },
      zeroed: {
        transientRiseMB: mean(armB.map((a) => a.transientRiseMB)),
        settledRiseMB: mean(armB.map((a) => a.settledRiseMB)),
        runs: armB.map((a) => a.transientRiseMB),
      },
      transientSavingMB: mean(armA.map((a) => a.transientRiseMB)) != null && mean(armB.map((a) => a.transientRiseMB)) != null
        ? +(mean(armA.map((a) => a.transientRiseMB)) - mean(armB.map((a) => a.transientRiseMB))).toFixed(3)
        : null,
      settledSavingMB: mean(armA.map((a) => a.settledRiseMB)) != null && mean(armB.map((a) => a.settledRiseMB)) != null
        ? +(mean(armA.map((a) => a.settledRiseMB)) - mean(armB.map((a) => a.settledRiseMB))).toFixed(3)
        : null,
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
    writeArtifactAtomic(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ artifact: out, error: report.error || null, summary: report.summary || null }, null, 2));
  }
}

await main();
