#!/usr/bin/env node
/**
 * COMPETITOR-ARENA-REFERENCE-V1
 *
 * Answers the one question our own instruments cannot: is our GPU and renderer
 * footprint for a multi-panel chart pathological, or is it what this class of
 * product costs? It measures a third-party charting product with the SAME
 * instrument, viewport, dpr, panel count and settle protocol we measure
 * ourselves with, so the two numbers are comparable rather than merely adjacent.
 *
 * Point it at our own harness with --url to produce the self arm; that is the
 * point — one instrument on both sides.
 *
 * SETTLE IS MANDATORY AND DEFAULTS ON. A reading taken ~1s after collection
 * overstates our own four-panel floor by ~111 MB total / ~82 MB GPU (measured:
 * 531.84 -> 420.70 total, 182.12 -> 99.88 GPU, same probe, same boot). A
 * competitor number taken without the same settle is not comparable to ours.
 *
 * Logged-in products (TradingView Plus, FX Replay, TradeZella all gate
 * multi-chart behind a paid plan) need --headful --profile=<dir> --manual:
 * arrange the layout by hand, then press Enter to sample. The profile dir
 * persists the session so later runs skip the login.
 *
 *   node scripts/competitor-arena-reference.mjs \
 *     --label=tradingview-4up --url=https://www.tradingview.com/chart/ \
 *     --panels=4 --headful --manual --profile=.scratch/profiles/tv
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import {
  acquireRunLockOrExit, hostExclusivityWitness, lockFlagsFromArgv, writeArtifactAtomic,
} from './lib/run-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MB = 1048576;

function argOf(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  console.error(`[competitor-arena ${new Date().toISOString()}]`, ...args);
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  await new Promise((resolve) => rl.question(`${prompt}\n> `, () => resolve()));
  rl.close();
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
    const processes = rows.map((p) => ({
      pid: p.id,
      type: p.type,
      privateMB: footprints[p.id]?.privateMB ?? null,
    }));
    const sumWhere = (re) => +processes.filter((p) => re.test(p.type))
      .reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3);
    return {
      totalPrivateMB: +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      rendererPrivateMB: sumWhere(/renderer/i),
      gpuPrivateMB: sumWhere(/gpu/i),
      processCount: processes.length,
      processes,
    };
  } finally {
    await bcdp.detach().catch(() => {});
  }
}

/**
 * Surface census. Deliberately product-agnostic: counts canvases and their
 * backing across every same-origin frame, plus dpr and viewport, so a
 * competitor's panel count and pixel budget can be checked rather than assumed.
 */
async function censusSurface(page, probeWebgl = false) {
  const frames = page.frames();
  const perFrame = [];
  for (const frame of frames) {
    const row = await frame.evaluate((probeWebgl) => {
      const canvases = [...document.querySelectorAll('canvas')];
      const dpr = window.devicePixelRatio || 1;
      return {
        url: (location.href || '').slice(0, 120),
        canvasCount: canvases.length,
        canvasBackingMB: +canvases.reduce(
          (s, c) => s + ((c.width || 0) * (c.height || 0) * 4) / 1048576, 0,
        ).toFixed(3),
        largestCanvas: canvases.reduce((best, c) => {
          const px = (c.width || 0) * (c.height || 0);
          return px > (best?.px || 0) ? { px, w: c.width, h: c.height } : best;
        }, null),
        dpr,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        // Off by default, and it must stay that way. There is no read-only way
        // to ask a canvas what context it holds: getContext('webgl') on a
        // canvas that has no context yet CREATES one, allocating GPU memory
        // inside the measurement it is supposed to observe — at every sample,
        // on every canvas. It returns null harmlessly only when a 2d context
        // already exists, which is luck rather than design. null means "not
        // asked", which is honest; 0 would claim an observation never made.
        webglContexts: probeWebgl ? canvases.filter((c) => {
          try {
            return !!(c.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
              || c.getContext('webgl'));
          } catch (_) { return false; }
        }).length : null,
      };
    }, probeWebgl).catch((error) => ({ error: String(error?.message || error) }));
    perFrame.push(row);
  }
  const sum = (k) => +perFrame.reduce((s, f) => s + (Number(f[k]) || 0), 0).toFixed(3);
  return {
    frameCount: perFrame.length,
    canvasCount: sum('canvasCount'),
    canvasBackingMB: sum('canvasBackingMB'),
    webglContexts: probeWebgl ? sum('webglContexts') : null,
    dpr: perFrame[0]?.dpr ?? null,
    viewport: perFrame[0] ? { w: perFrame[0].innerW, h: perFrame[0].innerH } : null,
    perFrame,
  };
}

async function sample(label, { page, cdp, browser, settleMs, probeWebgl }) {
  await collectGarbage(page, cdp);
  if (settleMs > 0) {
    // Native allocators decommit lazily. Without this wait the reading counts
    // freed-but-not-returned space as resident footprint.
    await sleep(settleMs);
    await collectGarbage(page, cdp);
  }
  const [proc, surface] = await Promise.all([
    readProcesses(browser),
    censusSurface(page, probeWebgl),
  ]);
  const row = {
    label,
    at: new Date().toISOString(),
    process: {
      totalPrivateMB: proc.totalPrivateMB,
      rendererPrivateMB: proc.rendererPrivateMB,
      gpuPrivateMB: proc.gpuPrivateMB,
      processCount: proc.processCount,
    },
    surface,
  };
  log(`${label}: total=${proc.totalPrivateMB} gpu=${proc.gpuPrivateMB} renderer=${proc.rendererPrivateMB} canvases=${surface.canvasCount} backing=${surface.canvasBackingMB}MB dpr=${surface.dpr}`);
  return row;
}

async function main() {
  const label = argOf('label', 'unlabelled');
  const url = argOf('url', null);
  const panels = Number(argOf('panels', '4')) || 4;
  const settleMs = Number(argOf('settle', '20000'));
  const width = Number(argOf('width', '1440')) || 1440;
  const height = Number(argOf('height', '960')) || 960;
  const dpr = Number(argOf('dpr', '2')) || 2;
  const profileDir = argOf('profile', null);
  const manual = hasFlag('manual');
  const headful = hasFlag('headful');
  const warmupMs = Number(argOf('warmup', '15000'));
  const idleSamples = Math.max(1, Number(argOf('idle-samples', '1')) || 1);
  const idleIntervalMs = Number(argOf('idle-interval', '30000')) || 30000;
  const probeWebgl = hasFlag('probe-webgl');
  const out = path.resolve(argOf('out', path.join(__dirname, '..', '_evidence', 'manager-A', `competitor-arena-${label}-${Date.now()}.json`)));

  const self = hasFlag('self');
  if (!url && !self) {
    console.error('--url is required (or --self to boot our own harness as the reference arm).');
    process.exit(2);
  }

  const lock = await acquireRunLockOrExit({
  artifact: out,
  script: 'competitor-arena-reference.mjs',
  ...lockFlagsFromArgv(),
});
  /**
   * The lock is checked once, at launch, and nothing stops a foreign run starting
   * thirty seconds later. Two arms of the 21:10+01:00 series completed beside E's
   * heap-cycle-browser and their JSON was indistinguishable from the clean ones —
   * I had to reconstruct which readings were contaminated from a terminal log.
   * Witnessed at both ends now, so the artifact answers that itself.
   */
  const exclusivityBefore = hostExclusivityWitness();
  const report = {
    signature: 'COMPETITOR-ARENA-REFERENCE-V1',
    at: new Date().toISOString(),
    runLock: { state: lock.state, pid: process.pid },
    hostExclusivity: { before: exclusivityBefore, state: 'RUN_IN_PROGRESS' },
    label,
    inputs: { url, panels, settleMs, viewport: { width, height }, dpr, manual, headful, warmupMs, probeWebgl },
    method: {
      memory: 'forced CDP collection, then settle, then collect again, then OS private memory per process',
      why: 'a ~1s post-GC reading overstates our own four-panel floor by ~111 MB total / ~82 MB GPU; the settle is what makes any cross-product number comparable',
      comparability: 'the SELF arm must be run from this same script at the same viewport, dpr, panel count and settle',
      caveats: [
        'browser process accounting includes the browser and network processes; compare renderer+GPU as well as total',
        'webglContexts is null unless --probe-webgl: detecting a context requires requesting one, which allocates on any canvas that had none, inside the measurement itself',
        'panel count must be verified from the surface census, not assumed from the layout that was requested',
      ],
    },
    /**
     * The coverage limit travels with the arm, because an artifact outlives the
     * conversation that produced it. A one-chart reference read later as a
     * four-chart one would manufacture a 3-4x gap out of panel count alone,
     * which is the specific misreading this block exists to prevent.
     */
    coverage: {
      panelsThisArm: panels,
      competitorArms: 'TradingView free only, one chart per layout',
      notMeasured: [
        'no multi-chart competitor data at any panel count',
        'paid tiers not purchased, so competitor multi-chart layouts were never reachable',
        'TradeZella and FX Replay dropped by the PO — no data, not a null result',
      ],
      headlineComparison: 'one-up ours versus one-up TradingView; any other pairing is not like-for-like',
      ourFourUp: 'OUR_OWN_SCALING_CURVE_NOT_A_COMPARISON',
    },
    samples: [],
  };
  const save = (phase) => {
    report.partial = phase || null;
    writeArtifactAtomic(out, JSON.stringify(report, null, 2));
  };

  let browser = null;
  let srv = null;
  let boot = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: !headful,
      protocolTimeout: 600_000,
      userDataDir: profileDir || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-precise-memory-info',
        '--disable-extensions',
        `--force-device-scale-factor=${dpr}`,
        '--js-flags=--expose-gc',
      ],
      defaultViewport: { width, height, deviceScaleFactor: dpr },
    });
    report.browser = { version: await browser.version() };

    let page;
    if (self) {
      // The reference arm boots our own harness through the same launch flags,
      // viewport and dpr as the competitor arms, so the two are comparable by
      // construction rather than by assertion.
      const { startServer } = await import('../chart v 1.4/chart/multichart-prod/harness/serve.mjs');
      const { bootLayout } = await import('../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs');
      srv = await startServer(0);
      report.inputs.selfHarness = { url: srv.url, panels, hostFile: 25, tf: '1m' };
      log(`self arm: booting ${panels} panel(s) at ${srv.url}`);
      boot = await bootLayout(browser, srv, { pair: 'same', panels, tf: '1m', hostFile: 25 });
      page = boot.page;
    } else {
      page = await browser.newPage();
      log(`opening ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    }

    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Performance.enable').catch(() => {});

    if (self) {
      log(`warmup ${warmupMs}ms`);
      await sleep(warmupMs);
    } else if (manual) {
      await waitForEnter(
        `Arrange a ${panels}-panel layout in the open window, let it finish drawing, then press Enter to sample.`,
      );
    } else {
      log(`warmup ${warmupMs}ms`);
      await sleep(warmupMs);
    }

    report.samples.push(await sample('loaded', { page, cdp, browser, settleMs, probeWebgl }));
    save('loaded');

    // Readings across an idle window separate three outcomes that a single
    // second sample cannot: still settling downward, plateaued at the resident
    // cost, or rising while nothing is being asked of the product. The third is
    // a slope, and at dpr 2 one run showed it.
    let elapsedIdleS = 0;
    for (let i = 0; i < idleSamples; i++) {
      await sleep(idleIntervalMs);
      elapsedIdleS += Math.round(idleIntervalMs / 1000);
      report.samples.push(await sample(`idle+${elapsedIdleS}s`, { page, cdp, browser, settleMs, probeWebgl }));
      save(`idle+${elapsedIdleS}s`);
    }

    const last = report.samples[report.samples.length - 1];
    const observedPanels = Math.max(1, panels);
    report.summary = {
      label,
      panelsRequested: panels,
      canvasCount: last.surface.canvasCount,
      canvasBackingMB: last.surface.canvasBackingMB,
      webglContexts: last.surface.webglContexts,
      dpr: last.surface.dpr,
      totalPrivateMB: last.process.totalPrivateMB,
      rendererPrivateMB: last.process.rendererPrivateMB,
      gpuPrivateMB: last.process.gpuPrivateMB,
      /**
       * Division, not measurement, and named so nobody quotes it as one. A
       * browser's fixed cost — GPU process, compositor, browser and network
       * processes — does not scale with panel count, so our 4-up total over four
       * is not our 1-up cost and cannot stand in for a 1-up arm. Measure the
       * panel count you intend to compare.
       */
      perPanelByDivision: {
        derivation: 'ARITHMETIC_NOT_A_MEASUREMENT',
        divisor: observedPanels,
        totalPrivateMB: +(last.process.totalPrivateMB / observedPanels).toFixed(2),
        rendererPrivateMB: +(last.process.rendererPrivateMB / observedPanels).toFixed(2),
        gpuPrivateMB: +(last.process.gpuPrivateMB / observedPanels).toFixed(2),
      },
      driftBetweenSamplesMB: report.samples.length > 1
        ? +(report.samples[1].process.totalPrivateMB - report.samples[0].process.totalPrivateMB).toFixed(2)
        : null,
    };

    // Idle slope. Nothing is asked of the product across this window, so a
    // positive figure is memory growing while the product sits still.
    if (report.samples.length > 1) {
      const first = report.samples[0];
      const last = report.samples[report.samples.length - 1];
      const minutes = (new Date(last.at) - new Date(first.at)) / 60000;
      const rise = (k) => +(last.process[k] - first.process[k]).toFixed(2);
      report.summary.idleSlope = {
        spanMinutes: +minutes.toFixed(2),
        totalPrivateMB: rise('totalPrivateMB'),
        rendererPrivateMB: rise('rendererPrivateMB'),
        gpuPrivateMB: rise('gpuPrivateMB'),
        totalMBPerMinute: minutes > 0 ? +(rise('totalPrivateMB') / minutes).toFixed(2) : null,
        gpuMBPerMinute: minutes > 0 ? +(rise('gpuPrivateMB') / minutes).toFixed(2) : null,
        monotonicRise: report.samples.every(
          (s, i) => i === 0 || s.process.totalPrivateMB >= report.samples[i - 1].process.totalPrivateMB,
        ),
        series: report.samples.map((s) => ({
          label: s.label,
          total: s.process.totalPrivateMB,
          gpu: s.process.gpuPrivateMB,
          renderer: s.process.rendererPrivateMB,
        })),
      };
    }
    report.partial = null;
    save(null);
  } catch (error) {
    report.error = String((error && error.stack) || error);
    process.exitCode = 1;
    log(`ERROR ${report.error}`);
    save('error');
  } finally {
    try { await boot?.close?.(); } catch (_) {}
    try { await browser?.close?.(); } catch (_) {}
    try { await srv?.close?.(); } catch (_) {}
    // Before the browser teardown would hide a foreign run that was there during
    // the reading: the scan runs while the evidence is still on the box.
    try { report.hostExclusivity = hostExclusivityWitness(exclusivityBefore); } catch (e) {
      report.hostExclusivity = { state: 'HOST_EXCLUSIVITY_UNKNOWN', why: `witness failed: ${String(e.message).slice(0, 120)}` };
    }
    writeArtifactAtomic(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ artifact: out, error: report.error || null, summary: report.summary || null }, null, 2));
  }
}

await main();
