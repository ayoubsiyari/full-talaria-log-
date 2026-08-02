/**
 * HOARD-CONSTRUCTOR-CENSUS — what grows by constructor, who retains it, and where blink_gc moves.
 *
 * The object-graph walk accounted for ~2.5 MB of a 633 MB drained floor. This instrument answers the
 * other 98% with three readings taken at TWO forced-GC moments on one session:
 *
 *   1. HeapProfiler.takeHeapSnapshot → aggregate by constructor, retainer paths for the top five growers
 *   2. memory-infra detailed dump → blink_gc / partition_alloc children (not just roots)
 *   3. DOM + canvas surface census (Documents / Nodes / canvases / detached canvas count)
 *
 * HYPOTHESIS CARRIED IN: detached canvas backing stores and retained DOM across four panels of layered
 * canvases. Those live in blink_gc and partition_alloc; the JS walk is blind to both by design.
 *
 * FLOOR DISCIPLINE (Director): every previously published floor is inflated by the 281.7 MB a real
 * collection takes. This run forces HeapProfiler.collectGarbage before EACH of the two drains and
 * reports the collected floor slope — it does not guess whether 22.89 MB/kbar survives re-basing.
 *
 * SOAK BLOCKER NOT CLOSED HERE: three of four CONF-01 panels still deliver zero bars under the current
 * distinct-dataset plan. This census still runs (the 1m panel delivers), but its per-kbar denominator
 * is one-panel bars unless a common-window boot lands first.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';
import { aggregateHeapSnapshotByConstructor, compareConstructorAggregates } from './lib/heap-snapshot-aggregates.mjs';
import { aggregateRetainerPaths } from './lib/heap-retainer-paths.mjs';
import {
  collectAllocatorDetail,
  pickHeaviestDetail,
  diffAllocatorDetail,
} from './lib/blink-allocator-detail.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
const WARM_MIN = Number(arg('warmMin', '4'));
const LEG_MIN = Number(arg('legMin', '12'));
const OUT_DIR = arg('outDir', `_evidence/manager-C/hoard-constructor-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
const TOP_N = Number(arg('topN', '5'));
const SNAP_CAP_MB = Number(arg('snapCapMB', '3072'));

const log = (m) => {
  const line = `[hoard-ctor ${new Date().toISOString().slice(11, 19)}] ${m}`;
  console.log(line);
  // Redirected detached logs buffer aggressively on Windows; flush so a kill mid-warm is visible.
  try { if (typeof process.stdout.write === 'function') process.stdout.write(''); } catch (_) {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sleepWithHeartbeat(ms, label) {
  const started = Date.now();
  let next = started + 60_000;
  while (Date.now() - started < ms) {
    const left = Math.min(15_000, ms - (Date.now() - started));
    await sleep(left);
    if (Date.now() >= next) {
      log(`${label}: heartbeat t+${Math.round((Date.now() - started) / 1000)}s / ${Math.round(ms / 1000)}s`);
      next = Date.now() + 60_000;
    }
  }
}

async function pauseAll(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
        if (!rs) return;
        const before = !!rs.isPlaying;
        if (typeof rs.pause === 'function') rs.pause();
        else if (typeof rs.togglePlayPause === 'function' && before) rs.togglePlayPause();
        out.push({ realm: label, before, after: !!rs.isPlaying });
      } catch (e) { out.push({ realm: label, error: String(e).slice(0, 80) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], `frame${i}`); } catch (_) {} }
    return out;
  });
}

/** Pause first (stop delivery), then force-collect. Pause is not a drain; the collection is. */
async function forceCollect(page) {
  const pause = await pauseAll(page).catch((e) => ({ error: String(e).slice(0, 100) }));
  await sleep(2000);
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    for (let i = 0; i < 3; i++) {
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {}
      try { await cdp.send('Runtime.collectGarbage'); } catch (_) {}
      await sleep(1000);
    }
    await sleep(4000);
  } finally {
    try { await cdp.detach(); } catch (_) {}
  }
  return pause;
}

async function readPlayhead(page) {
  return page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const chart = w.chart || null;
        const rs = w.replaySystem || (chart && chart.replaySystem) || null;
        if (!rs && !chart) return;
        out.push({
          realm: label,
          tf: chart?.currentTimeframe ?? null,
          playhead: Number.isFinite(rs?.currentIndex) ? rs.currentIndex : null,
          masterLen: Array.isArray(rs?.fullRawData) ? rs.fullRawData.length : null,
          residentBars: Array.isArray(chart?.rawData) ? chart.rawData.length : null,
          isPlaying: rs ? !!rs.isPlaying : null,
        });
      } catch (_) {}
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) {
      try { visit(window.frames[i], `frame${i}`); } catch (_) {}
    }
    return { atMs: Date.now(), panels: out };
  });
}

/** Surface census for the canvas/DOM hypothesis — what the walk cannot see. */
async function readSurfaceCensus(page) {
  return page.evaluate(() => {
    const scan = (doc, label) => {
      const canvases = [...doc.querySelectorAll('canvas')].map((c) => ({
        w: c.width, h: c.height,
        cssW: Math.round(c.getBoundingClientRect().width),
        cssH: Math.round(c.getBoundingClientRect().height),
        attached: !!c.isConnected,
        parent: c.parentElement ? c.parentElement.tagName : null,
      }));
      return {
        realm: label,
        url: (() => { try { return doc.defaultView?.location?.pathname || null; } catch (_) { return null; } })(),
        documents: 1,
        nodes: doc.getElementsByTagName('*').length,
        canvases: canvases.length,
        canvasPixels: canvases.reduce((a, c) => a + (c.w * c.h), 0),
        detachedCanvasesInDomQuery: canvases.filter((c) => !c.attached).length,
        canvasDetail: canvases.slice(0, 24),
      };
    };
    const realms = [scan(document, 'host')];
    for (let i = 0; i < window.frames.length; i++) {
      try { realms.push(scan(window.frames[i].document, `frame${i}`)); } catch (e) {
        realms.push({ realm: `frame${i}`, error: String(e).slice(0, 80) });
      }
    }
    return {
      realms,
      totals: {
        canvases: realms.reduce((a, r) => a + (r.canvases || 0), 0),
        canvasPixels: realms.reduce((a, r) => a + (r.canvasPixels || 0), 0),
        nodes: realms.reduce((a, r) => a + (r.nodes || 0), 0),
      },
    };
  });
}

async function readDomCounters(page) {
  const cdp = await page.createCDPSession();
  try {
    const d = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
    return {
      documents: d.documents ?? null,
      nodes: d.nodes ?? null,
      jsEventListeners: d.jsEventListeners ?? null,
    };
  } finally {
    try { await cdp.detach(); } catch (_) {}
  }
}

function loadSnapshotJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function topConstructors(aggMap, n = 20) {
  return [...aggMap.values()]
    .sort((a, b) => b.size - a.size || b.count - a.count)
    .slice(0, n)
    .map((r) => ({
      constructor: r.constructor,
      count: r.count,
      sizeMB: +(r.size / 1048576).toFixed(3),
      sizeBytes: r.size,
    }));
}

function hypothesisHits(ctorRows) {
  const keys = [
    /Canvas/i, /HTMLCanvasElement/i, /Detached.*canvas/i,
    /HTML(Div|Span|Table|Image|Element)/i, /Detached\s*</i,
    /ArrayBuffer/i, /Uint8Array/i, /ExternalString/i,
    /CSS/i, /StyleSheet/i, /Layout/i,
  ];
  return ctorRows.filter((r) => keys.some((re) => re.test(r.constructor)));
}

async function moment(label, { page, browser, browserCdp, outDir }) {
  log(`${label}: pause + force-collect`);
  const pause = await forceCollect(page);
  const footprint = await readFootprint(browser);
  const playhead = await readPlayhead(page);
  const surface = await readSurfaceCensus(page);
  const dom = await readDomCounters(page);

  log(`${label}: floor ${footprint.footprintTotalMB} MB, canvases=${surface.totals.canvases}, nodes=${dom.nodes}`);

  const snapFile = path.join(outDir, `${label}.heapsnapshot`);
  log(`${label}: taking heap snapshot (cap ${SNAP_CAP_MB} MB)`);
  const snapMeta = await takeEndOfArmSnapshot(page, {
    outFile: snapFile,
    capMB: SNAP_CAP_MB,
    requireFreeMB: SNAP_CAP_MB + 4096,
    timeoutMs: 600_000,
  });
  log(`${label}: snapshot ok=${snapMeta.ok} ${snapMeta.mb ?? '?'} MB  ${snapMeta.failedWhy || snapMeta.skippedWhy || ''}`);

  let constructors = null;
  let top = null;
  if (snapMeta.ok && snapMeta.file) {
    log(`${label}: parsing snapshot (this can take a minute)`);
    const snap = loadSnapshotJson(snapMeta.file);
    const agg = aggregateHeapSnapshotByConstructor(snap);
    constructors = Object.fromEntries([...agg.entries()].map(([k, v]) => [k, { count: v.count, size: v.size }]));
    top = topConstructors(agg, 40);
    // Free the giant object before retainer walk of a smaller target set.
    // Retainer paths need the full snap — keep it only for top-N later at B.
    return {
      label,
      at: new Date().toISOString(),
      pause,
      footprint,
      playhead,
      surface,
      dom,
      snapMeta,
      constructors,
      top,
      _agg: agg,
      _snapFile: snapMeta.file,
    };
  }
  return {
    label, at: new Date().toISOString(), pause, footprint, playhead, surface, dom, snapMeta,
    constructors: null, top: null, _agg: null, _snapFile: null,
  };
}

async function dumpAllocators(label, browserCdp, outDir) {
  log(`${label}: memory-infra detailed dump`);
  const byPid = await collectAllocatorDetail(browserCdp);
  const heaviest = pickHeaviestDetail(byPid);
  const slim = {
    processCount: byPid.size,
    heaviestPid: heaviest?.pid ?? null,
    heaviestScoreMB: heaviest?.score ?? null,
    detail: heaviest?.detail ?? null,
  };
  fs.writeFileSync(path.join(outDir, `${label}-allocators.json`), JSON.stringify(slim, null, 2));
  const roots = slim.detail?.rootsMB || {};
  log(`${label}: allocators blink_gc=${roots.blink_gc} partition_alloc=${roots.partition_alloc} v8=${roots.v8} skia=${roots.skia} cc=${roots.cc}`);
  return slim;
}

export function gradeConstructorGrowth(beforeAgg, afterAgg, { topN = 5 } = {}) {
  if (!beforeAgg || !afterAgg) {
    return { verdict: 'INSUFFICIENT', why: 'missing constructor aggregates at one or both moments' };
  }
  const rows = compareConstructorAggregates(beforeAgg, afterAgg)
    .filter((r) => r.sizeDelta !== 0 || r.countDelta !== 0)
    .sort((a, b) => b.sizeDelta - a.sizeDelta);
  const top = rows.slice(0, topN).map((r) => ({
    constructor: r.constructor,
    countBefore: r.countBefore,
    countAfter: r.countAfter,
    countDelta: r.countDelta,
    sizeBeforeMB: +(r.sizeBefore / 1048576).toFixed(3),
    sizeAfterMB: +(r.sizeAfter / 1048576).toFixed(3),
    sizeDeltaMB: +(r.sizeDelta / 1048576).toFixed(3),
  }));
  const hyp = hypothesisHits(top);
  return {
    verdict: 'MEASURED',
    topGrowers: top,
    hypothesisHitsInTop: hyp,
    totalSizeDeltaMB: +(rows.reduce((a, r) => a + r.sizeDelta, 0) / 1048576).toFixed(3),
  };
}

export function gradeForcedGcSlope({ probeA, probeB, barsDelivered }) {
  const a = probeA?.footprint?.footprintTotalMB;
  const b = probeB?.footprint?.footprintTotalMB;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { verdict: 'INSUFFICIENT', why: 'missing forced-GC floors' };
  }
  const deltaMB = +(b - a).toFixed(1);
  const tA = Date.parse(probeA.at);
  const tB = Date.parse(probeB.at);
  const hours = (tB - tA) / 3600000;
  const mbPerHour = hours > 0 ? +(deltaMB / hours).toFixed(1) : null;
  const mbPerKbar = (Number.isFinite(barsDelivered) && barsDelivered > 0)
    ? +(deltaMB / (barsDelivered / 1000)).toFixed(2)
    : null;
  return {
    verdict: 'MEASURED',
    floorAMB: a,
    floorBMB: b,
    deltaMB,
    hours: hours > 0 ? +hours.toFixed(4) : null,
    mbPerHour,
    barsDelivered: barsDelivered ?? null,
    mbPerKbar,
    note: 'Both floors taken after HeapProfiler.collectGarbage. This is the re-based slope; do not compare it to a pause-and-wait floor without stating the 281.7 MB inflation.',
    priorPauseFloorSlopeMBPerKbar: 22.89,
    priorFloorInflationMB: 281.7,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const seal = await computeSeal(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const artifact = {
    signature: 'HOARD-CONSTRUCTOR-CENSUS-V1',
    startedAt: new Date().toISOString(),
    identity: { buildId: seal.badge ?? null, sourceCommit: info.sourceCommitSha ?? null, origin: ORIGIN },
    condition: {
      requestedSpeed: SPEED, warmMin: WARM_MIN, legMin: LEG_MIN,
      indicators: 'conf05 ema+vwap', trades: 0,
      hypothesis: 'detached canvas backing stores + retained DOM; four panels of layered canvases; blink_gc + partition_alloc',
      soakBlockerOpen: 'CONF-01 distinct datasets do not overlap — 3/4 panels deliver zero bars. Per-kbar denominators here are one-panel unless a common-window boot lands.',
      floorDiscipline: 'every published floor level is inflated by ~281.7 MB a real collection takes; slope is re-measured with forced GC at BOTH drains, not guessed',
    },
    moments: {},
  };

  let session = null;
  let browserCdp = null;
  try {
    log(`booting CONF-01 speed=${SPEED} (${seal.badge ?? '?'})`);
    session = await bootConf01Session({
      indicators: loadConf05Indicators().pairs,
      replaySpeed: SPEED,
      placeOrder: false,
      label: 'hoard-constructor-census',
    });
    const { page, browser } = session;
    browserCdp = await browser.target().createCDPSession();

    log(`warming ${WARM_MIN} min`);
    await sleepWithHeartbeat(WARM_MIN * 60_000, 'warm');

    // Moment A — forced GC floor + snapshot + allocators
    const mA = await moment('A', { page, browser, browserCdp, outDir: OUT_DIR });
    const allocA = await dumpAllocators('A', browserCdp, OUT_DIR);
    artifact.moments.A = {
      at: mA.at,
      pause: mA.pause,
      footprintMB: mA.footprint.footprintTotalMB,
      footprint: mA.footprint,
      playhead: mA.playhead,
      surface: mA.surface,
      dom: mA.dom,
      snapMeta: mA.snapMeta,
      topConstructors: mA.top,
      allocators: allocA,
    };

    // Resume play for the leg
    log(`leg ${LEG_MIN} min of play`);
    await page.evaluate(() => {
      const visit = (w) => {
        try {
          const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
          if (!rs) return;
          if (typeof rs.play === 'function' && !rs.isPlaying) rs.play();
          else if (typeof rs.togglePlayPause === 'function' && !rs.isPlaying) rs.togglePlayPause();
        } catch (_) {}
      };
      visit(window);
      for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) {} }
    }).catch(() => {});
    const phStart = await readPlayhead(page);
    await sleepWithHeartbeat(LEG_MIN * 60_000, 'leg');
    const phEnd = await readPlayhead(page);

    let barsDelivered = 0;
    for (const p of phStart.panels) {
      const q = phEnd.panels.find((x) => x.realm === p.realm);
      if (!q) continue;
      const d = (q.playhead ?? 0) - (p.playhead ?? 0);
      if (d > 0) barsDelivered += d;
    }
    artifact.leg = { phStart, phEnd, barsDelivered, note: 'positive playhead deltas only; index re-bases not counted as negative' };
    log(`leg delivered ${barsDelivered} bars (sum of forward playhead moves)`);

    // Moment B
    const mB = await moment('B', { page, browser, browserCdp, outDir: OUT_DIR });
    const allocB = await dumpAllocators('B', browserCdp, OUT_DIR);
    artifact.moments.B = {
      at: mB.at,
      pause: mB.pause,
      footprintMB: mB.footprint.footprintTotalMB,
      footprint: mB.footprint,
      playhead: mB.playhead,
      surface: mB.surface,
      dom: mB.dom,
      snapMeta: mB.snapMeta,
      topConstructors: mB.top,
      allocators: allocB,
    };

    // Growth + retainers for top five
    artifact.forcedGcSlope = gradeForcedGcSlope({
      probeA: { at: mA.at, footprint: mA.footprint },
      probeB: { at: mB.at, footprint: mB.footprint },
      barsDelivered,
    });
    artifact.constructorGrowth = gradeConstructorGrowth(mA._agg, mB._agg, { topN: TOP_N });
    log(`forced-GC slope: ${artifact.forcedGcSlope.deltaMB} MB / ${artifact.forcedGcSlope.barsDelivered} bars = ${artifact.forcedGcSlope.mbPerKbar} MB/kbar`);
    log(`top growers: ${(artifact.constructorGrowth.topGrowers || []).map((r) => `${r.constructor} +${r.sizeDeltaMB}MB`).join(', ')}`);

    if (mB._snapFile && artifact.constructorGrowth.topGrowers?.length) {
      log('computing retainer paths for top five growers');
      const snapB = loadSnapshotJson(mB._snapFile);
      const ctors = artifact.constructorGrowth.topGrowers.map((r) => r.constructor);
      artifact.retainerPaths = aggregateRetainerPaths(snapB, {
        constructors: ctors,
        topPaths: 12,
        maxDepth: 14,
        // 8k OOMed a 1 GB node on a 256 MB snapshot; 1500 is enough to rank path shapes.
        samplePerCtor: 1_500,
      });
      // Drop giant path lists' raw snap from memory by not retaining snapB
    }

    if (allocA.detail && allocB.detail) {
      artifact.allocatorDiff = diffAllocatorDetail(allocA.detail, allocB.detail);
      const blink = (artifact.allocatorDiff.childDeltas.blink_gc || []).slice(0, 15);
      const part = (artifact.allocatorDiff.childDeltas.partition_alloc || []).slice(0, 15);
      log(`blink_gc child growth top: ${blink.map((r) => `${r.name.split('/').slice(-1)[0]} ${r.deltaMB > 0 ? '+' : ''}${r.deltaMB}`).join(', ')}`);
      log(`partition_alloc child growth top: ${part.map((r) => `${r.name.split('/').slice(-1)[0]} ${r.deltaMB > 0 ? '+' : ''}${r.deltaMB}`).join(', ')}`);
    }

    // Hypothesis scoreboard
    const surfA = mA.surface?.totals || {};
    const surfB = mB.surface?.totals || {};
    artifact.hypothesisScoreboard = {
      carriedIn: artifact.condition.hypothesis,
      canvasCountA: surfA.canvases, canvasCountB: surfB.canvases,
      canvasPixelsA: surfA.canvasPixels, canvasPixelsB: surfB.canvasPixels,
      nodesA: mA.dom?.nodes, nodesB: mB.dom?.nodes,
      documentsA: mA.dom?.documents, documentsB: mB.dom?.documents,
      blinkGcAMB: allocA.detail?.rootsMB?.blink_gc ?? null,
      blinkGcBMB: allocB.detail?.rootsMB?.blink_gc ?? null,
      partitionAMB: allocA.detail?.rootsMB?.partition_alloc ?? null,
      partitionBMB: allocB.detail?.rootsMB?.partition_alloc ?? null,
      constructorHypothesisHits: artifact.constructorGrowth.hypothesisHitsInTop || [],
    };

    artifact.verdict = 'CAPTURED';
  } catch (err) {
    artifact.verdict = 'ERROR';
    artifact.error = String(err && err.stack ? err.stack : err).slice(0, 2000);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (browserCdp) await browserCdp.detach(); } catch (_) {}
    try { if (session?.browser) await session.browser.close(); } catch (_) {}
    // Strip non-JSON helpers if any leaked
    const outFile = path.join(OUT_DIR, 'report.json');
    const clean = JSON.parse(JSON.stringify(artifact));
    fs.writeFileSync(outFile, JSON.stringify(clean, null, 2));
    log(`artifact -> ${outFile}`);
  }
}

// Guarded: ESM importers that only want the graders must not launch a browser.
// Prefer `import.meta.url === pathToFileURL(process.argv[1]).href`, but argv[1] is
// unreliable under some Windows launchers, so --noRun remains the hard off switch.
import { pathToFileURL } from 'node:url';
const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect && !process.argv.includes('--noRun')) main();
