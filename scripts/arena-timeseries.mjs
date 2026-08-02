/**
 * ARENA-TIMESERIES-V1 — E's memory-infra dump, sampled across a multi-hour play session.
 *
 * Director (2026-08-02): every arena number we own is an event delta; nobody has measured
 * arena growth across hours. partition_alloc can be the largest arena and still barely move
 * on a pair switch — floor and slope are different problems. This instrument answers which
 * arenas grow under long play.
 *
 * Deliberately reuses E's dump path:
 *   - collectMemoryDump / summariseAllocators from process-memory-census.mjs
 *   - readOsFootprints for process private
 * Does NOT invent a parallel arena framework.
 *
 * Session: same-symbol CONF-01, requireDeliveringPanels=4. Common-window is a hard gate.
 * Slope numbers from this run are NOT quotable as the soak rate until the forced-GC floor
 * re-base also lands — this answers arena GROWTH identity, not the MB/kbar quote.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';

import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { readFootprint } from './lib/footprint.mjs';
import {
  collectMemoryDump,
  readOsFootprints,
  describeVisibility,
} from './process-memory-census.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[arena-ts ${new Date().toISOString().slice(11, 19)}] ${m}`);

const HOURS = Number(arg('hours', '3'));
const INTERVAL_MIN = Number(arg('interval', '10'));
const WARMUP_MIN = Number(arg('warmup', '3'));
const SPEED = Number(arg('speed', '10'));
const FORCE_GC_EVERY = Number(arg('forceGcEvery', '3')); // every Nth sample also takes a drained reading
const OUT = arg('out', `_evidence/manager-C/arena-timeseries-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

async function forceGc(page) {
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    for (let i = 0; i < 3; i++) {
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {}
      try { await cdp.send('Runtime.collectGarbage'); } catch (_) {}
      await sleep(400);
    }
    await sleep(1000);
  } finally {
    try { await cdp.detach(); } catch (_) {}
  }
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const visit = (w) => {
      try {
        const c = w.chart;
        const rs = w.replaySystem || c?.replaySystem;
        return {
          replayIndex: rs?.currentIndex ?? null,
          replayTimestamp: rs?.replayTimestamp ?? rs?.currentTime ?? null,
          residentBars: c?.rawData?.length ?? null,
          isPlaying: !!rs?.isPlaying,
          fileId: c?.currentFileId ?? null,
          tf: c?.currentTimeframe ?? null,
        };
      } catch (e) {
        return { error: String(e).slice(0, 80) };
      }
    };
    const host = visit(window);
    const panels = [host];
    for (let i = 0; i < window.frames.length; i++) {
      try { panels.push(visit(window.frames[i])); } catch (_) {}
    }
    return {
      host,
      panels,
      advancingPanels: panels.filter((p) => p && p.isPlaying).length,
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
    };
  }).catch((e) => ({ error: String(e?.message || e).slice(0, 160) }));
}

async function sampleArenas({ browser, browserCdp, page, label, drained }) {
  if (drained) await forceGc(page);
  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const processInfo = info.processInfo || [];
  const footprints = await readOsFootprints(processInfo.map((p) => p.id)).catch(() => ({}));
  const dumps = await collectMemoryDump(browserCdp).catch((e) => {
    log(`memory dump failed: ${e?.message || e}`);
    return new Map();
  });
  const fp = await readFootprint(browser).catch(() => ({ footprintTotalMB: null }));
  const playhead = await readPlayhead(page);

  const rows = processInfo.map((p) => ({
    pid: p.id,
    type: p.type,
    privateMB: footprints[p.id]?.privateMB ?? null,
    workingSetMB: footprints[p.id]?.workingSetMB ?? null,
    allocators: dumps.get(p.id) || null,
  }));
  const renderers = rows.filter((r) => /renderer/i.test(r.type));
  const gpu = rows.find((r) => /gpu/i.test(r.type)) || null;
  const pageRenderer = [...renderers].sort((a, b) => (b.privateMB || 0) - (a.privateMB || 0))[0] || null;
  const totalPrivateMB = +rows.reduce((a, r) => a + (r.privateMB || 0), 0).toFixed(2);
  const rendererPrivateMB = +renderers.reduce((a, r) => a + (r.privateMB || 0), 0).toFixed(2);
  const gpuPrivateMB = gpu?.privateMB ?? null;
  const roots = pageRenderer?.allocators || null;

  return {
    label,
    at: new Date().toISOString(),
    drained: !!drained,
    footprintTotalMB: fp.footprintTotalMB ?? null,
    totalPrivateMB,
    rendererPrivateMB,
    gpuPrivateMB,
    jsHeapMB: playhead.jsHeapMB ?? null,
    playhead,
    pageRenderer: pageRenderer
      ? { pid: pageRenderer.pid, privateMB: pageRenderer.privateMB, allocators: roots }
      : null,
    visibility: describeVisibility({
      jsHeapMB: playhead.jsHeapMB || 0,
      rendererMB: pageRenderer?.privateMB || 0,
      gpuMB: gpuPrivateMB || 0,
      totalMB: totalPrivateMB,
    }),
    // Keep a slim process list (pids/types/private) — full dump is in allocators on heaviest.
    processPrivateMB: rows.map((r) => ({ pid: r.pid, type: r.type, privateMB: r.privateMB })),
  };
}

/** Rank root arenas by growth between first and last sample of the same drain mode. */
export function rankArenaGrowth(samples, { drained = false } = {}) {
  const series = samples.filter((s) => !!s.drained === !!drained && s.pageRenderer?.allocators);
  if (series.length < 2) {
    return { ok: false, why: `need ≥2 ${drained ? 'drained' : 'live'} samples with allocator roots`, seriesLength: series.length };
  }
  const first = series[0];
  const last = series[series.length - 1];
  const a0 = first.pageRenderer.allocators;
  const a1 = last.pageRenderer.allocators;
  const keys = new Set([...Object.keys(a0 || {}), ...Object.keys(a1 || {})]);
  const deltas = [];
  for (const k of keys) {
    const before = Number(a0?.[k]) || 0;
    const after = Number(a1?.[k]) || 0;
    deltas.push({
      arena: k,
      firstMB: before,
      lastMB: after,
      deltaMB: +(after - before).toFixed(3),
      absDeltaMB: +(Math.abs(after - before)).toFixed(3),
    });
  }
  deltas.sort((x, y) => y.deltaMB - x.deltaMB);
  const hours = (new Date(last.at) - new Date(first.at)) / 3_600_000;
  const growers = deltas.filter((d) => d.deltaMB > 0.5);
  const flat = deltas.filter((d) => Math.abs(d.deltaMB) <= 0.5);
  const shrinkers = deltas.filter((d) => d.deltaMB < -0.5);
  return {
    ok: true,
    drained: !!drained,
    samples: series.length,
    hours: +hours.toFixed(3),
    firstAt: first.at,
    lastAt: last.at,
    totalPrivateDeltaMB: +(last.totalPrivateMB - first.totalPrivateMB).toFixed(2),
    rendererPrivateDeltaMB: +(last.rendererPrivateMB - first.rendererPrivateMB).toFixed(2),
    gpuPrivateDeltaMB: (last.gpuPrivateMB != null && first.gpuPrivateMB != null)
      ? +(last.gpuPrivateMB - first.gpuPrivateMB).toFixed(2) : null,
    growers, // delta > 0.5 MB
    flat,
    shrinkers,
    allByGrowth: deltas,
    verdict: growers.length
      ? `GROWING_ARENAS: ${growers.map((g) => `${g.arena}(+${g.deltaMB})`).join(', ')}`
      : 'NO_ARENA_GREW_ABOVE_0.5MB',
    decisionNote: growers.length
      ? 'Slope work should target the growing arenas. Floor work targets large flat arenas (e.g. partition_alloc steady cost).'
      : 'No arena root grew >0.5 MB across this window — defect may be floor-dominated or the window was too short.',
  };
}

async function main() {
  const seal = await computeSeal(arg('origin', 'http://31.97.192.82:3000')).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(arg('origin', 'http://31.97.192.82:3000')).catch((e) => ({ error: String(e).slice(0, 120) }));
  const artifact = {
    signature: 'ARENA-TIMESERIES-V1',
    startedAt: new Date().toISOString(),
    question: 'Which memory-infra arenas grow across a multi-hour play session?',
    identity: { buildId: seal.badge ?? null, sourceCommit: info.sourceCommitSha ?? null },
    condition: {
      hours: HOURS,
      intervalMin: INTERVAL_MIN,
      warmupMin: WARMUP_MIN,
      speed: SPEED,
      forceGcEveryNthSample: FORCE_GC_EVERY,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      dumpPath: 'E: process-memory-census.collectMemoryDump (disabled-by-default-memory-infra)',
      note: 'Does not invent a new arena instrument. Reuses E\'s dump. MB/kbar slopes remain non-quotable until forced-GC floor re-base lands.',
    },
    samples: [],
    growth: {},
  };

  const save = (phase) => {
    artifact.partial = phase || null;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
  };

  let session = null;
  let browserCdp = null;
  try {
    log(`booting same-symbol CONF-01 speed=${SPEED} for ${HOURS}h @ ${INTERVAL_MIN}min`);
    session = await bootConf01Session({
      indicators: loadConf05Indicators().pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'arena-timeseries',
    });
    artifact.conf01 = {
      datasetMode: session.conf01.datasetMode,
      delivering: session.conf01.delivering,
      fileIds: session.conf01.fileIds,
    };
    browserCdp = await session.browser.target().createCDPSession();
    log(`boot ok advancing=${session.conf01.delivering?.advancingPanels}`);
    save('booted');

    log(`warm ${WARMUP_MIN} min`);
    await sleep(WARMUP_MIN * 60_000);

    const nSamples = Math.max(2, Math.floor((HOURS * 60) / INTERVAL_MIN) + 1);
    const t0 = Date.now();
    for (let i = 0; i < nSamples; i++) {
      const elapsedMin = +((Date.now() - t0) / 60_000).toFixed(1);
      const drained = (i === 0) || (i === nSamples - 1) || (FORCE_GC_EVERY > 0 && i % FORCE_GC_EVERY === 0);

      // Always take a live sample while playing.
      log(`sample ${i + 1}/${nSamples} live t+${elapsedMin}m`);
      const live = await sampleArenas({
        browser: session.browser,
        browserCdp,
        page: session.page,
        label: `live-${i}`,
        drained: false,
      });
      live.elapsedMin = elapsedMin;
      artifact.samples.push(live);
      const roots = live.pageRenderer?.allocators || {};
      log(`  live total=${live.totalPrivateMB} ren=${live.rendererPrivateMB} gpu=${live.gpuPrivateMB} `
        + `pa=${roots.partition_alloc ?? '?'} malloc=${roots.malloc ?? '?'} v8=${roots.v8 ?? '?'} `
        + `blink_gc=${roots.blink_gc ?? '?'} canvas=${roots.canvas ?? '?'}`);

      if (drained) {
        log(`sample ${i + 1}/${nSamples} drained t+${elapsedMin}m`);
        // Pause briefly so GC can settle; resume after.
        await session.page.evaluate(() => {
          const visit = (w) => {
            try {
              const rs = w.replaySystem || w.chart?.replaySystem;
              if (rs && typeof rs.pause === 'function') rs.pause();
            } catch (_) {}
          };
          visit(window);
          for (let fi = 0; fi < window.frames.length; fi++) { try { visit(window.frames[fi]); } catch (_) {} }
        }).catch(() => {});
        const drainedSample = await sampleArenas({
          browser: session.browser,
          browserCdp,
          page: session.page,
          label: `drained-${i}`,
          drained: true,
        });
        drainedSample.elapsedMin = elapsedMin;
        artifact.samples.push(drainedSample);
        await session.page.evaluate(() => {
          const visit = (w) => {
            try {
              const rs = w.replaySystem || w.chart?.replaySystem;
              if (rs && typeof rs.play === 'function' && !rs.isPlaying) rs.play();
            } catch (_) {}
          };
          visit(window);
          for (let fi = 0; fi < window.frames.length; fi++) { try { visit(window.frames[fi]); } catch (_) {} }
        }).catch(() => {});
        const dr = drainedSample.pageRenderer?.allocators || {};
        log(`  drained total=${drainedSample.totalPrivateMB} pa=${dr.partition_alloc ?? '?'} `
          + `malloc=${dr.malloc ?? '?'} v8=${dr.v8 ?? '?'} blink_gc=${dr.blink_gc ?? '?'}`);
      }

      save(`sample-${i}`);
      if (i < nSamples - 1) {
        const nextAt = t0 + (i + 1) * INTERVAL_MIN * 60_000;
        const wait = Math.max(0, nextAt - Date.now());
        log(`sleep ${(wait / 60_000).toFixed(1)} min to next sample`);
        await sleep(wait);
      }
    }

    artifact.growth.live = rankArenaGrowth(artifact.samples, { drained: false });
    artifact.growth.drained = rankArenaGrowth(artifact.samples, { drained: true });
    artifact.verdict = artifact.growth.live.ok
      ? artifact.growth.live.verdict
      : 'INCOMPLETE';
    artifact.decision = {
      live: artifact.growth.live.decisionNote || null,
      drained: artifact.growth.drained.decisionNote || null,
      floorVsSlope: 'Large flat arenas on the drained series are floor. Arenas that climb on the live (and especially drained) series are slope.',
    };
    artifact.partial = null;
    artifact.finishedAt = new Date().toISOString();
    save(null);
    log(`DONE ${artifact.verdict}`);
    log(`live growers: ${(artifact.growth.live.growers || []).map((g) => `${g.arena}+${g.deltaMB}`).join(', ') || 'none'}`);
    log(`drained growers: ${(artifact.growth.drained.growers || []).map((g) => `${g.arena}+${g.deltaMB}`).join(', ') || 'none'}`);
  } catch (e) {
    artifact.verdict = 'ERROR';
    artifact.error = String(e?.stack || e).slice(0, 2000);
    log('ERROR ' + artifact.error.split('\n')[0]);
    save('error');
  } finally {
    try { if (browserCdp) await browserCdp.detach(); } catch (_) {}
    try { if (session?.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect && !process.argv.includes('--noRun')) main();
