/**
 * A7b P0 — anchored VP placement stress probe (harness, tile A).
 * Measures placement latency, render/schedule counts, margin.r, and bin-cache hits.
 *
 * Usage: node a7b-p0-anchored-vp-freeze-probe.mjs [--bars=N] [--switch-off=bin-cache|render-guard|local-invalidation|rc3]
 */
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout, sleep } from './harness-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';

function parseArgs(argv) {
  const args = { bars: 50000, switchOff: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--bars=')) args.bars = Math.max(2000, Number(a.split('=')[1]) || 50000);
    if (a.startsWith('--switch-off=')) args.switchOff = a.split('=')[1];
  }
  return args;
}

async function defaultVolumeAnchorPoints(page) {
  return page.evaluate(() => {
    const ch = window.chart;
    const len = Array.isArray(ch?.data) ? ch.data.length : 0;
    const idx = Math.max(10, Math.floor(len * 0.30));
    const bar = ch.data[idx];
    return [{ x: idx, y: Number(bar?.c ?? bar?.close ?? 1) }];
  });
}

async function installProbes(page, switchOff) {
  return page.evaluate((off) => {
    const w = window;
    w.__a7bProbe = {
      scheduleRenderCount: 0,
      renderCount: 0,
      binCacheHits: 0,
      binCacheMisses: 0,
      marginBefore: null,
      marginAfter: null,
      dataLen: 0,
      placementMs: null,
      responsive: true,
    };

    if (off === 'bin-cache') w.__TALARIA_DISABLE_ANCHORED_VP_BIN_CACHE_FIX = true;
    if (off === 'render-guard') w.__TALARIA_DISABLE_DRAWING_INVALIDATION_DURING_RENDER_GUARD = true;
    if (off === 'local-invalidation') w.__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2 = true;
    if (off === 'rc3') w.__TALARIA_RC3_VOLUME_RENDER_RESOLVE = false;

    const ch = w.chart;
    if (!ch) return { ok: false, reason: 'no chart' };

    w.__a7bProbe.marginBefore = { ...(ch.margin || {}) };

    if (typeof ch.scheduleRender === 'function' && !ch.__a7bScheduleWrapped) {
      ch.__a7bScheduleWrapped = true;
      const orig = ch.scheduleRender.bind(ch);
      ch.scheduleRender = (...args) => {
        w.__a7bProbe.scheduleRenderCount += 1;
        return orig(...args);
      };
    }
    if (typeof ch.render === 'function' && !ch.__a7bRenderWrapped) {
      ch.__a7bRenderWrapped = true;
      const origR = ch.render.bind(ch);
      ch.render = (...args) => {
        w.__a7bProbe.renderCount += 1;
        return origR(...args);
      };
    }

    return { ok: true };
  }, switchOff);
}

async function inflateBars(page, targetBars) {
  return page.evaluate((n) => {
    const ch = window.chart;
    if (!ch || !Array.isArray(ch.data) || ch.data.length === 0) return { ok: false, reason: 'no data' };
    const base = ch.data;
    const out = [];
    const step = 60_000;
    let t = Number(base[0].t);
    for (let i = 0; i < n; i++) {
      const src = base[i % base.length];
      out.push({
        t: t + i * step,
        o: src.o ?? src.open,
        h: src.h ?? src.high,
        l: src.l ?? src.low,
        c: src.c ?? src.close,
        v: src.v ?? src.volume ?? 100,
      });
    }
    ch.data = out;
    if (typeof ch.bumpDataVersion === 'function') ch.bumpDataVersion();
    else ch.dataVersion = (ch.dataVersion ?? 0) + 1;
    if (typeof ch.scheduleRender === 'function') ch.scheduleRender();
    return { ok: true, len: out.length };
  }, targetBars);
}

async function readProbe(page) {
  return page.evaluate(() => {
    const p = window.__a7bProbe || {};
    const ch = window.chart;
    p.marginAfter = ch && ch.margin ? { ...ch.margin } : null;
    p.dataLen = ch && Array.isArray(ch.data) ? ch.data.length : 0;
    const dm = ch && ch.drawingManager;
    const avp = dm && dm.drawings ? dm.drawings.find((d) => d && d.type === 'anchored-volume-profile') : null;
    p.hasAvp = !!avp;
    p.binCachePresent = !!(avp && avp._vpBinCache);
    return p;
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: false });
  const switchOff = args.switchOff;
  const preDocument = switchOff ? {
    fn: (off) => {
      if (off === 'bin-cache') window.__TALARIA_DISABLE_ANCHORED_VP_BIN_CACHE_FIX = true;
      if (off === 'render-guard') window.__TALARIA_DISABLE_DRAWING_INVALIDATION_DURING_RENDER_GUARD = true;
      if (off === 'local-invalidation') window.__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2 = true;
      if (off === 'rc3') window.__TALARIA_RC3_VOLUME_RENDER_RESOLVE = false;
    },
    args: [switchOff],
  } : null;
  const layout = await bootLayout(browser, srv, { panels: 1, preDocument });
  const page = layout.page;
  try {
    await sleep(500);
    await installProbes(page, switchOff);
    const inflated = await inflateBars(page, args.bars);
    if (!inflated.ok) throw new Error(inflated.reason || 'inflate failed');
    await sleep(800);

    const t0 = Date.now();
    const placed = await placeTool(page, 'A', 'anchored-volume-profile', await defaultVolumeAnchorPoints(page));
    const placementMs = Date.now() - t0;
    await sleep(300);

    const probe = await readProbe(page);
    probe.placementMs = placementMs;
    probe.placedId = placed && placed.id ? placed.id : null;
    probe.switchOff = args.switchOff;
    probe.bars = args.bars;

    console.log(JSON.stringify(probe, null, 2));
  } finally {
    await layout.close();
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
