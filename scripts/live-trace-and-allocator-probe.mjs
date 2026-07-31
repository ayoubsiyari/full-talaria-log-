#!/usr/bin/env node
/**
 * LIVE TRACE + ALLOCATOR PROBE — decompose the per-event cost by category, and name the arena, both against the
 * RUNNING soak.
 *
 * WHY A TRACE. Six MONSTER-2 candidates have been eliminated - the cache key, the slice, the full resample, the
 * viewport bound, REPLAY_RAW_CAP, the context trim - and five of the six were found by reading source, while the
 * cost itself was measured in a browser. A day has gone into subtracting small quantities from a number nobody
 * has decomposed. This decomposes it: scripting, rendering, layout, painting, GC.
 *
 * WHY A MEMORY DUMP IN THE SAME ATTACH. `Tracing.requestMemoryDump` at BACKGROUND detail is the cheap tier of
 * Chrome's memory-infra, and it emits per-process allocator totals - malloc, PartitionAlloc, v8, skia. That is
 * exactly the instrument I said would need a host that is not mid-soak. If background detail is cheap enough to
 * take live, the arena question does not have to wait for arm 2.
 *
 * RISK, STATED BEFORE RUNNING RATHER THAN AFTER:
 *   - A trace buffer lives in the browser process and my soak's footprint metric sums ALL processes, so a trace
 *     can inflate one sample. Mitigation: 3 seconds, ReportEvents transfer so the buffer drains to me rather
 *     than accumulating, and the exact window is recorded so the affected sample can be annotated.
 *   - Tracing costs CPU. The renderer is already pinned at ~127%, so the run gets slower during the window; it
 *     does not get wrong, because bars delivered and memory are both read per sample and the window is 3s of a
 *     180s sampling interval.
 *   - `Tracing.end` frees the buffer. Health is re-checked immediately afterwards.
 * If any of this reads as too expensive on the night's only soak, the correct action is to skip it and say so.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const PORT = argOf('port', '49797');
const PHASES = argOf('phases', 'timeline');
const TRACE_MS = Number(argOf('traceMs', '3000'));
const OUT = argOf('out', `c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LIVE-TRACE-${PHASES.toUpperCase()}-20260731.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DevTools' own category mapping, so these buckets mean what the profiler panel means by them. */
function categoryOf(name) {
  if (/^(FunctionCall|EvaluateScript|v8\.run|v8\.callFunction|TimerFire|FireAnimationFrame|RunMicrotasks|XHRReadyStateChange|EventDispatch|ParseScriptOnBackground|v8\.compile|V8\.Execute|MajorGC|MinorGC)/.test(name) && !/GC/.test(name)) return 'scripting';
  if (/^(UpdateLayoutTree|RecalculateStyles|ScheduleStyleRecalculation|InvalidateLayout|StyleRecalcInvalidationTracking)/.test(name)) return 'rendering';
  if (/^(Layout|LayoutShift|UpdateLayerTree|HitTest)/.test(name)) return 'layout';
  if (/^(Paint|PaintImage|RasterTask|CompositeLayers|Rasterize|DecodeImage|ResizeImage|DrawFrame|GPUTask|Commit)/.test(name)) return 'painting';
  if (/(GCEvent|MajorGC|MinorGC|BlinkGC|V8\.GC|GCIdleNotification|CollectGarbage)/i.test(name)) return 'gc';
  if (/^(ParseHTML|ParseAuthorStyleSheet)/.test(name)) return 'parsing';
  return null;
}

const report = {
  signature: 'LIVE-TRACE-AND-ALLOCATOR-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  phases: PHASES,
  bfcacheState: 'default (enabled) — the running soak browser. Declared per RESET-01.',
  whyThisExists: 'Six MONSTER-2 candidates were eliminated by reading source; the 86 ms per event has never been decomposed. One trace beats a seventh source read.',
  riskAccepted: `Trace window ${TRACE_MS} ms with ReportEvents transfer so the buffer drains rather than accumulating. The exact window is recorded so the soak sample overlapping it can be annotated. Health re-checked immediately after Tracing.end.`,
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];

  // Bars before, so cost per DATA EVENT is measured against events this window actually delivered.
  const barsOf = async () => {
    let total = 0;
    for (const f of page.frames()) {
      const n = await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0);
      total += n || 0;
    }
    return total;
  };

  // PHASE 'profile': the V8 sampling profiler on the PAGE target. The trace says 87% of main-thread time is
  // scripting inside FireAnimationFrame; only a profile names the function, and a 1 ms sampling profiler is
  // materially lighter than a full category trace.
  if (PHASES === 'profile') {
    const pcdp = await page.createCDPSession();
    const barsBefore0 = await barsOf();
    await pcdp.send('Profiler.enable');
    await pcdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    const t0 = Date.now();
    await pcdp.send('Profiler.start');
    await sleep(TRACE_MS);
    const { profile } = await pcdp.send('Profiler.stop');
    const t1 = Date.now();
    const barsAfter0 = await barsOf();
    await pcdp.send('Profiler.disable').catch(() => {});
    await pcdp.detach().catch(() => {});

    const byId = new Map((profile.nodes || []).map((n) => [n.id, n]));
    const selfTicks = new Map();
    for (const n of profile.nodes || []) selfTicks.set(n.id, n.hitCount || 0);
    const totalTicks = [...selfTicks.values()].reduce((a, b) => a + b, 0) || 1;
    const durMs = (profile.endTime - profile.startTime) / 1000;
    const rows = [...selfTicks.entries()].filter(([, h]) => h > 0)
      .map(([id, hits]) => {
        const n = byId.get(id);
        const cf = n?.callFrame || {};
        return {
          fn: cf.functionName || '(anonymous)',
          url: String(cf.url || '').split('/').pop(),
          line: cf.lineNumber != null ? cf.lineNumber + 1 : null,
          selfPercent: +((hits / totalTicks) * 100).toFixed(1),
          selfMs: +((hits / totalTicks) * durMs).toFixed(1),
        };
      }).sort((a, b) => b.selfPercent - a.selfPercent).slice(0, 25);
    report.window = { startedAt: new Date(t0).toISOString(), wallMs: t1 - t0, barsBefore: barsBefore0, barsAfter: barsAfter0, barsDelivered: barsAfter0 - barsBefore0 };
    // The same function appears once per CALL PATH in a profile tree, so the raw rows understate any function
    // reached from several callers. Aggregate by identity, and record who calls it - the caller is what says
    // whether this is per-bar work, per-marker work, or per-frame work.
    const parentOf = new Map();
    for (const n of profile.nodes || []) for (const c of (n.children || [])) parentOf.set(c, n.id);
    const agg = new Map();
    for (const [id, hits] of selfTicks.entries()) {
      if (!hits) continue;
      const n = byId.get(id); const cf = n?.callFrame || {};
      const key = `${cf.functionName || '(anonymous)'}|${String(cf.url || '').split('/').pop()}|${cf.lineNumber != null ? cf.lineNumber + 1 : ''}`;
      const cur = agg.get(key) || { hits: 0, paths: 0, callers: new Map() };
      cur.hits += hits; cur.paths += 1;
      const pid2 = parentOf.get(id);
      const pcf = pid2 != null ? byId.get(pid2)?.callFrame : null;
      if (pcf) {
        const ck = `${pcf.functionName || '(anonymous)'} @ ${String(pcf.url || '').split('/').pop()}:${pcf.lineNumber != null ? pcf.lineNumber + 1 : ''}`;
        cur.callers.set(ck, (cur.callers.get(ck) || 0) + hits);
      }
      agg.set(key, cur);
    }
    const aggregated = [...agg.entries()].map(([key, v]) => {
      const [fn, url, line] = key.split('|');
      return {
        fn, url, line: line ? Number(line) : null,
        selfPercent: +((v.hits / totalTicks) * 100).toFixed(1),
        selfMs: +((v.hits / totalTicks) * durMs).toFixed(0),
        callPaths: v.paths,
        topCallers: [...v.callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, h]) => `${c} (${((h / v.hits) * 100).toFixed(0)}%)`),
      };
    }).sort((a, b) => b.selfPercent - a.selfPercent).slice(0, 12);
    report.aggregatedBySelfTime = aggregated;
    report.topThreeShare = +aggregated.slice(0, 3).reduce((s, r) => s + r.selfPercent, 0).toFixed(1);

    report.profile = {
      samplingIntervalUs: 1000,
      totalSamples: totalTicks,
      profiledMs: +durMs.toFixed(0),
      note: 'SELF time by function on the HOST realm only. The host carries 97.7% of resident bars, so it is the realm that matters, but the three iframe realms are NOT in this profile.',
      topSelf: rows,
    };
    report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ window: report.window, samples: totalTicks, profiledMs: report.profile.profiledMs, topThreeShare: report.topThreeShare, aggregated: report.aggregatedBySelfTime }, null, 1));
    try { await browser.disconnect(); } catch { /* gone */ }
    process.exit(0);
  }

  const client = await browser.target().createCDPSession();
  const events = [];
  client.on('Tracing.dataCollected', (d) => { if (d && d.value) events.push(...d.value); });
  const complete = new Promise((resolve) => client.once('Tracing.tracingComplete', resolve));

  const includedCategories = PHASES === 'memory'
    ? ['disabled-by-default-memory-infra']
        // NO 'toplevel'. Its RunTask events WRAP everything, so an outermost-only pass credits 99.9% of the time to
    // a wrapper and reports "other". That is exactly what my first trace did, and it decomposed nothing.
    : ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute', 'blink.user_timing', 'disabled-by-default-v8.gc'];

  const barsBefore = await barsOf();
  const wallStart = Date.now();
  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories },
  });

  if (PHASES === 'memory') {
    // BACKGROUND detail is the cheap tier: process totals only, no per-allocator-object walking.
    const dump = await client.send('Tracing.requestMemoryDump', { deterministic: false, levelOfDetail: 'background' }).catch((e) => ({ error: String(e.message).slice(0, 200) }));
    report.memoryDumpRequest = dump;
    await sleep(1200);
  } else {
    await sleep(TRACE_MS);
  }

  await client.send('Tracing.end');
  await complete;
  const wallEnd = Date.now();
  const barsAfter = await barsOf();
  await client.detach().catch(() => {});

  report.window = {
    startedAt: new Date(wallStart).toISOString(),
    endedAt: new Date(wallEnd).toISOString(),
    wallMs: wallEnd - wallStart,
    barsBefore,
    barsAfter,
    barsDelivered: barsAfter - barsBefore,
    annotateSoakSample: 'Any soak sample whose timestamp falls inside this window carries trace overhead and should be annotated, not silently graded.',
  };
  report.traceEventCount = events.length;

  if (PHASES !== 'memory') {
    // Identify the chart renderer's MAIN thread from metadata, rather than assuming a pid.
    const threadNames = new Map();
    const procNames = new Map();
    for (const e of events) {
      if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name);
      if (e.ph === 'M' && e.name === 'process_name') procNames.set(e.pid, e.args?.name);
    }
    // The busiest CrRendererMain is the chart: other renderers are ~20 MB idle pages.
    const busyByThread = new Map();
    for (const e of events) {
      if (e.ph !== 'X' || !(e.dur > 0)) continue;
      const key = `${e.pid}:${e.tid}`;
      if (threadNames.get(key) !== 'CrRendererMain') continue;
      busyByThread.set(key, (busyByThread.get(key) || 0) + e.dur);
    }
    const mainKey = [...busyByThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    report.mainThread = { key: mainKey, candidates: [...busyByThread.entries()].map(([k, v]) => ({ thread: k, busyMs: +(v / 1000).toFixed(1) })) };

    if (mainKey) {
      const [mpid, mtid] = mainKey.split(':').map(Number);
      // Container events that merely wrap real work. Counting them hides the decomposition.
      const CONTAINERS = /^(RunTask|ThreadControllerImpl::RunTask|BlinkScheduler|MessageLoop|SequenceManager|ThreadControllerImpl::DoWork|TaskGraphRunner)/;
      const mine = events.filter((e) => e.ph === 'X' && e.pid === mpid && e.tid === mtid && e.dur > 0 && !CONTAINERS.test(e.name))
        .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
      // Outermost-only, so nested events are not double counted.
      const buckets = {}; const named = {};
      let coveredEnd = -Infinity; let topLevelBusyUs = 0;
      for (const e of mine) {
        if (e.ts < coveredEnd) continue;
        coveredEnd = e.ts + e.dur;
        topLevelBusyUs += e.dur;
        const cat = categoryOf(e.name) || 'other';
        buckets[cat] = (buckets[cat] || 0) + e.dur;
        named[e.name] = (named[e.name] || 0) + e.dur;
      }
      const totalMs = topLevelBusyUs / 1000;
      const evs = report.window.barsDelivered || 0;
      report.decomposition = {
        method: 'Outermost X events on the busiest CrRendererMain, so nested work is counted once. Categories follow DevTools own mapping.',
        topLevelBusyMs: +totalMs.toFixed(1),
        wallMs: report.window.wallMs,
        busyFractionOfWall: +((totalMs / report.window.wallMs) * 100).toFixed(1),
        barsDelivered: evs,
        msPerDataEvent: evs > 0 ? +(totalMs / evs).toFixed(1) : null,
        byCategoryMs: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +(v / 1000).toFixed(1)])),
        byCategoryPercent: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +((v / topLevelBusyUs) * 100).toFixed(1)])),
        byCategoryMsPerEvent: evs > 0 ? Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +((v / 1000) / evs).toFixed(1)])) : null,
        topEvents: Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 15)
          .map(([name, us]) => ({ name, ms: +(us / 1000).toFixed(1), percent: +((us / topLevelBusyUs) * 100).toFixed(1) })),
      };
    }
  } else {
    // Allocator totals per process from the memory-infra dump.
    const dumps = events.filter((e) => e.ph === 'v' || e.name === 'periodic_interval');
    const perProcess = [];
    for (const e of dumps) {
      const allocators = e.args?.dumps?.allocators;
      if (!allocators) continue;
      const rows = {};
      for (const [name, node] of Object.entries(allocators)) {
        if (name.includes('/')) continue; // roots only
        const size = node?.attrs?.size?.value;
        if (size == null) continue;
        rows[name] = +((parseInt(size, 16) || 0) / 1048576).toFixed(1);
      }
      const totals = e.args?.dumps?.process_totals;
      perProcess.push({
        pid: e.pid,
        residentMB: totals?.resident_set_bytes ? +((parseInt(totals.resident_set_bytes, 16) || 0) / 1048576).toFixed(1) : null,
        privateFootprintMB: totals?.private_footprint_bytes ? +((parseInt(totals.private_footprint_bytes, 16) || 0) / 1048576).toFixed(1) : null,
        allocatorsMB: rows,
      });
    }
    perProcess.sort((a, b) => (b.privateFootprintMB ?? b.residentMB ?? 0) - (a.privateFootprintMB ?? a.residentMB ?? 0));
    report.allocatorDump = {
      processCount: perProcess.length,
      processes: perProcess,
      largest: perProcess[0] ?? null,
      reading: perProcess[0]
        ? `Largest process holds ${perProcess[0].privateFootprintMB ?? perProcess[0].residentMB} MB with allocator split ${JSON.stringify(perProcess[0].allocatorsMB)}. This names the arena rather than inferring it.`
        : 'No dump payload parsed — the memory-infra category may not be compiled into this Chrome build.',
    };
  }
} catch (e) {
  report.error = String(e && e.stack || e).slice(0, 900);
} finally {
  try { await browser?.disconnect?.(); } catch { /* gone */ }
}

report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ window: report.window, decomposition: report.decomposition, allocator: report.allocatorDump?.reading, mainThread: report.mainThread?.candidates, error: report.error }, null, 1).slice(0, 4000));
