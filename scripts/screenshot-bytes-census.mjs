#!/usr/bin/env node
/**
 * SCREENSHOT-BYTES-CENSUS-V1 — what a per-position screenshot actually costs on the
 * live page, under CONF-01/CONF-02.
 *
 * D measured 98,306 bytes to 0 on ONE trade with an 8 KB synthetic screenshot and
 * the Director rejected it as a product figure. This measures the real payload the
 * product's own capture path produces, at the real chart size, on the deployed
 * build, and multiplies it by the closed-position count CONF-02 requires.
 *
 * THE CAPTURE PATH IS THE PRODUCT'S, NOT MINE: order-manager.js:29853 calls
 * `window.screenshotManager.captureChartSnapshot()` and assigns the result to
 * `order.entryScreenshot`. This script calls the same function and attaches the
 * result the same way, so the bytes are the bytes a user's trade carries.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - the character length of each real capture, and the retained total across the
 *     product's own heavy-key list (order-manager.js:3982-3984)
 *   - JS heap after forced collection with and without the payloads attached, so
 *     the row figure is corroborated by an independent gauge
 *   - whether M20-A1 has externalised the payloads to IndexedDB, which would mean
 *     the heap cost is already paid elsewhere and eviction recovers less
 * WHAT IT CANNOT SEE:
 *   - a user's own screenshot settings (scale, format); the config read off the
 *     page is reported so the figure can be scaled
 *   - anything outside the renderer JS heap for the row figure; the heap gauge is
 *     reported beside it as the cross-check
 *
 * GATE-01: a known payload of known size is attached first and the census must
 * report it. A byte counter that cannot see a planted 250 KB string is not trusted
 * to report zero.
 */
import fs from 'node:fs';

import {
  bootConf01Session, cycleTrades, keepConf01Playing, measureHeavyFieldBytes,
  readConf01State, readTradeState,
} from './lib/conf01-session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** MEAS-01: the stamp read off the running page, not from git. */
async function readBuildStamp(page) {
  return page.evaluate(() => {
    const fromScript = [...document.querySelectorAll('script[src]')]
      .map((s) => /[?&]v=([\w.\-]+)/.exec(s.getAttribute('src') || ''))
      .find(Boolean);
    return {
      scriptVersion: fromScript ? fromScript[1] : null,
      buildId: window.__TALARIA_BUILD_ID || window.TALARIA_BUILD || null,
      href: location.href,
    };
  }).catch(() => null);
}

async function probeScreenshotManager(page, { captures = 5 } = {}) {
  return page.evaluate(async (n) => {
    const sm = window.screenshotManager;
    if (!sm || typeof sm.captureChartSnapshot !== 'function') {
      return { available: false, reason: 'window.screenshotManager.captureChartSnapshot missing' };
    }
    const lengths = [];
    const durationsMs = [];
    const errors = [];
    let mime = null;
    for (let i = 0; i < n; i += 1) {
      try {
        const t0 = performance.now();
        const shot = await sm.captureChartSnapshot();
        durationsMs.push(Math.round(performance.now() - t0));
        if (typeof shot === 'string') {
          lengths.push(shot.length);
          if (!mime) mime = (/^data:([^;]+)/.exec(shot) || [])[1] || null;
        } else if (shot) {
          lengths.push(JSON.stringify(shot).length);
        } else {
          errors.push('capture returned null');
        }
      } catch (e) {
        errors.push(String(e?.message || e).slice(0, 120));
      }
    }
    const canvas = document.querySelector('canvas');
    return {
      available: true,
      captures: lengths.length,
      errors,
      mime,
      lengths,
      durationsMs,
      // The capture is synchronous main-thread work on a replaying chart, so its
      // cost is a CPU term for A as well as a memory term for D and E.
      meanCaptureMs: durationsMs.length ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length) : null,
      meanChars: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null,
      minChars: lengths.length ? Math.min(...lengths) : null,
      maxChars: lengths.length ? Math.max(...lengths) : null,
      // Payload size scales with the pixel area being encoded, so the geometry is
      // part of the figure rather than a footnote.
      canvasCss: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
      canvasBacking: canvas ? { w: canvas.width, h: canvas.height } : null,
      devicePixelRatio: window.devicePixelRatio,
      m20a1IdbDisabled: window.__TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1 === true,
    };
  }, captures).catch((e) => ({ available: false, reason: String(e?.message || e).slice(0, 200) }));
}

/** GATE-01: plant a payload of known size and require the counter to report it. */
async function plantAndMeasure(page, bytes) {
  const planted = await page.evaluate((n) => {
    const ch = window.chart;
    const om = ch && (ch.orderManager || window.orderManager);
    const row = (om?.closedPositions || [])[0] || (om?.openPositions || [])[0];
    if (!row) return { ok: false, reason: 'no position to plant on' };
    row.__censusPlantedOriginal = row.entryScreenshot ?? null;
    row.entryScreenshot = `data:image/png;base64,${'A'.repeat(n)}`;
    return { ok: true, chars: row.entryScreenshot.length };
  }, bytes).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 160) }));
  if (!planted?.ok) return { planted, detected: null };
  const heavy = await measureHeavyFieldBytes(page);
  await page.evaluate(() => {
    const ch = window.chart;
    const om = ch && (ch.orderManager || window.orderManager);
    const row = (om?.closedPositions || [])[0] || (om?.openPositions || [])[0];
    if (row && '__censusPlantedOriginal' in row) {
      row.entryScreenshot = row.__censusPlantedOriginal;
      delete row.__censusPlantedOriginal;
    }
  }).catch(() => {});
  return { planted, detected: heavy?.deduped?.totalChars ?? heavy?.totalChars ?? null };
}

/**
 * Attach a real capture to each position the way the product does. A single
 * capture reused across rows would be ONE string in the heap and would understate
 * the cost by the row count, so each row gets its own capture.
 */
async function attachRealScreenshots(page, { maxRows = 40, batch = 4, gapMs = 700 } = {}) {
  const out = { ok: true, batches: 0, attached: 0, clonedFallbacks: 0, totalChars: 0, errors: [] };
  // Attaching in one long loop crashed the renderer ("Target closed") at 40
  // captures, so the loop is driven from Node in small batches with the page
  // allowed to breathe between them. A crash now costs one batch, not the run.
  for (let offset = 0; offset < maxRows; offset += batch) {
    const r = await page.evaluate(async (from, count) => {
      const sm = window.screenshotManager;
      const ch = window.chart;
      const om = ch && (ch.orderManager || window.orderManager);
      if (!sm || typeof sm.captureChartSnapshot !== 'function' || !om) {
        return { ok: false, reason: 'screenshotManager or orderManager unavailable' };
      }
      const rows = [...(om.closedPositions || []), ...(om.openPositions || [])].slice(from, from + count);
      let attached = 0;
      let cloned = 0;
      let chars = 0;
      for (const row of rows) {
        let shot = null;
        try {
          shot = await sm.captureChartSnapshot();
        } catch { shot = null; }
        if (typeof shot !== 'string' || !shot.length) {
          // Fall back to a distinct COPY of an earlier capture: same bytes,
          // separate allocation, so the total stays honest when capture throttles.
          const prior = window.__censusLastShot;
          if (typeof prior === 'string') { shot = (` ${prior}`).slice(1); cloned += 1; } else continue;
        } else {
          window.__censusLastShot = shot;
        }
        row.entryScreenshot = shot;
        chars += shot.length;
        attached += 1;
      }
      return { ok: true, rows: rows.length, attached, cloned, chars };
    }, offset, batch).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 200) }));

    out.batches += 1;
    if (!r?.ok) {
      out.errors.push({ offset, reason: r?.reason ?? 'unknown' });
      if (/Target closed|detached|crash/i.test(r?.reason || '')) { out.ok = false; out.fatal = r.reason; break; }
      continue;
    }
    out.attached += r.attached;
    out.clonedFallbacks += r.cloned;
    out.totalChars += r.chars;
    if (!r.rows) break;
    await sleep(gapMs);
  }
  return out;
}

async function heapAfterGc(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(400);
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(1_200);
  const m = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const get = (n) => (m.metrics || []).find((x) => x.name === n)?.value ?? null;
  return {
    heapMB: get('JSHeapUsedSize') != null ? +(get('JSHeapUsedSize') / 1048576).toFixed(2) : null,
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
  };
}

/** Does M20-A1 externalise the payloads, and what is left on the row afterwards? */
async function readIdbExternalisation(page) {
  return page.evaluate(async () => {
    const ch = window.chart;
    const om = ch && (ch.orderManager || window.orderManager);
    const rows = [...(om?.closedPositions || []), ...(om?.openPositions || [])];
    const marked = rows.filter((r) => r && r.m20_a1_screenshot_idb_v1).length;
    const withInlineShot = rows.filter((r) => typeof r?.entryScreenshot === 'string' && r.entryScreenshot.length > 1_000).length;
    let idb = null;
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        idb = { usageBytes: est.usage ?? null, quotaBytes: est.quota ?? null };
      }
    } catch { idb = null; }
    return {
      rows: rows.length,
      rowsMarkedExternalised: marked,
      rowsWithInlineScreenshot: withInlineShot,
      storageEstimate: idb,
      flagDisabled: window.__TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1 === true,
    };
  }).catch(() => null);
}

export async function runScreenshotBytesCensus({
  closedTarget = 30, speed = 60, outPath = null, plantBytes = 250_000,
} = {}) {
  const { browser, page, cdp, conf01 } = await bootConf01Session({ replaySpeed: speed });
  const report = {
    signature: 'SCREENSHOT-BYTES-CENSUS-V1',
    startedAtIso: new Date().toISOString(),
    conf01: { compliant: conf01?.compliant, failed: conf01?.failed, datasets: conf01?.observedDatasets },
    closedTarget,
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  report.liveness = { pageErrors: [], crashed: false };
  page.on('error', (err) => {
    report.liveness.crashed = true;
    report.liveness.pageErrors.push(String(err?.message || err).slice(0, 200));
    console.error(`[shots] PAGE CRASHED: ${String(err?.message || err).slice(0, 160)}`);
    save();
  });

  try {
    report.build = await readBuildStamp(page);
    console.error(`[shots] build=${JSON.stringify(report.build)} conf01=${conf01?.compliant}`);

    report.capture = await probeScreenshotManager(page, { captures: 5 });
    console.error(`[shots] capture available=${report.capture?.available} mean=${report.capture?.meanChars} chars mime=${report.capture?.mime} canvas=${JSON.stringify(report.capture?.canvasBacking)}`);
    save();

    // Accumulate the CONF-02 book before measuring: a per-position figure taken on
    // one trade is what the Director already rejected.
    let closed = (await readTradeState(page))?.managerClosed ?? 0;
    let guard = 0;
    while (closed < closedTarget && guard < 40) {
      const r = await cycleTrades(page, { open: 5, close: 5, holdMs: 1_500 });
      const st = await readTradeState(page);
      closed = st?.managerClosed ?? closed;
      guard += 1;
      if (!r.closed) { await keepConf01Playing(page, speed); await sleep(1_500); }
    }
    report.trades = await readTradeState(page);
    report.state = await readConf01State(page, { advanceWindowMs: 2_500 });
    console.error(`[shots] book: closed=${report.trades?.managerClosed} open=${report.trades?.managerOpen}`);

    report.heavyBeforeAttach = await measureHeavyFieldBytes(page);
    report.heapBeforeAttach = await heapAfterGc(cdp);

    report.gate01 = await plantAndMeasure(page, plantBytes);
    report.gate01.detectsPlantedPayload = (report.gate01.detected ?? 0) >= plantBytes;
    console.error(`[shots] GATE-01 planted ${plantBytes} chars, counter read ${report.gate01.detected} -> ${report.gate01.detectsPlantedPayload ? 'DETECTED' : 'BLIND'}`);
    save();

    report.attach = await attachRealScreenshots(page, { maxRows: closedTarget + 10 });
    console.error(`[shots] attached=${report.attach?.attached} rows (${report.attach?.clonedFallbacks} cloned) totalChars=${report.attach?.totalChars}`);
    report.heavyAfterAttach = await measureHeavyFieldBytes(page);
    report.heapAfterAttach = await heapAfterGc(cdp);
    report.idb = await readIdbExternalisation(page);
    save();

    const perShot = report.capture?.meanChars ?? null;
    const rowsWith = report.heavyAfterAttach?.deduped?.rowsWithHeavy ?? report.heavyAfterAttach?.rowsWithHeavy ?? 0;
    const dedupChars = report.heavyAfterAttach?.deduped?.totalChars ?? null;
    const heapDeltaMB = (report.heapAfterAttach?.heapMB != null && report.heapBeforeAttach?.heapMB != null)
      ? +(report.heapAfterAttach.heapMB - report.heapBeforeAttach.heapMB).toFixed(2)
      : null;
    report.conclusion = {
      buildStamp: report.build?.scriptVersion ?? null,
      perPositionChars: perShot,
      // base64 is ASCII, so V8 keeps it as a one-byte string: ~1 byte per char plus
      // header. Reported as chars with the byte reading beside it rather than
      // silently doubling for UTF-16.
      perPositionKB: perShot != null ? +(perShot / 1024).toFixed(1) : null,
      rowsCarryingAScreenshot: rowsWith,
      retainedCharsDeduplicated: dedupChars,
      retainedMB: dedupChars != null ? +(dedupChars / 1048576).toFixed(2) : null,
      heapAfterGcDeltaMB: heapDeltaMB,
      atConf02Target: perShot != null ? +((perShot * closedTarget) / 1048576).toFixed(2) : null,
      externalisedToIdb: report.idb?.rowsMarkedExternalised ?? null,
      gate01: report.gate01?.detectsPlantedPayload ? 'PASS: planted payload detected' : 'FAIL: counter blind to a planted payload',
      caveat: 'entry screenshots only; a closed position may also carry exitScreenshot and railScreenshots, so this is a floor on the per-position cost',
    };
    console.error(`[shots] CONCLUSION per-position=${report.conclusion.perPositionKB} KB, ${report.conclusion.rowsCarryingAScreenshot} rows, retained=${report.conclusion.retainedMB} MB, heapDelta=${heapDeltaMB} MB, at ${closedTarget} closed=${report.conclusion.atConf02Target} MB`);
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
    if (k === 'closed-target') o.closedTarget = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'plant-bytes') o.plantBytes = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /screenshot-bytes-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const report = await runScreenshotBytesCensus(parseArgs(process.argv.slice(2)));
  console.error(`[shots] done: ${JSON.stringify(report.conclusion)}`);
}
