#!/usr/bin/env node
/**
 * LONG-TASK ANATOMY — the 792 ms freeze as a first-class object, not a by-product of a calibration.
 *
 * An averaged 708 ms/s is a statistic nobody experiences. A single main-thread task that runs three quarters
 * of a second is the thing a user files a bug about. This instrument answers two questions about THAT task
 * rather than about the window it happened to sit in:
 *
 *   --phase=anatomy    What is inside one specific long task: its nested event tree, its category split, and
 *                      the JS stacks sampled DURING IT (not aggregated over the trace). Uses the trace-embedded
 *                      v8 CPU profiler so samples and task boundaries share one clock - correlating a separate
 *                      Profiler.start against trace timestamps would be a second clock and a second argument.
 *
 *   --phase=frequency  How often long tasks occur per hour of soak, from the browser's own Long Tasks API over
 *                      a multi-minute window. A 5-second trace containing one 792 ms task extrapolates to 720
 *                      per hour, which is arithmetic, not measurement. This counts them.
 *
 * Read-only against the live soak: attaches, never closes the browser, and the frequency phase removes its own
 * observer and global afterwards. Both phases record their exact window so overlapping soak samples can be
 * annotated rather than silently graded.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser, assertSameBrowser } from './lib/find-soak-port.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const PORT = argOf('port', '49797');
const PHASE = argOf('phase', 'anatomy');
const TRACE_MS = Number(argOf('traceMs', '15000'));
const OBSERVE_MS = Number(argOf('observeMs', '720000'));
const MIN_TASK_MS = Number(argOf('minTaskMs', '500'));
const ATTEMPTS = Number(argOf('attempts', '3'));
const OUT = argOf('out', `c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LONG-TASK-${PHASE.toUpperCase()}-20260731.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function categoryOf(name) {
  if (/(GCEvent|MajorGC|MinorGC|BlinkGC|V8\.GC|GCIdleNotification|CollectGarbage)/i.test(name)) return 'gc';
  if (/^(FunctionCall|EvaluateScript|v8\.run|v8\.callFunction|TimerFire|FireAnimationFrame|RunMicrotasks|XHRReadyStateChange|EventDispatch|ParseScriptOnBackground|v8\.compile|V8\.Execute|HandlePostMessage)/.test(name)) return 'scripting';
  if (/^(UpdateLayoutTree|RecalculateStyles|ScheduleStyleRecalculation|InvalidateLayout|StyleRecalcInvalidationTracking)/.test(name)) return 'rendering';
  if (/^(Layout|LayoutShift|UpdateLayerTree|HitTest)/.test(name)) return 'layout';
  if (/^(Paint|PaintImage|RasterTask|CompositeLayers|Rasterize|DecodeImage|ResizeImage|DrawFrame|GPUTask|Commit)/.test(name)) return 'painting';
  if (/^(ParseHTML|ParseAuthorStyleSheet)/.test(name)) return 'parsing';
  return 'other';
}
const CONTAINERS = /^(RunTask|ThreadControllerImpl::RunTask|BlinkScheduler|MessageLoop|SequenceManager|ThreadControllerImpl::DoWork|TaskGraphRunner)/;
const short = (u) => String(u || '').split('/').pop();

const report = {
  signature: 'LONG-TASK-ANATOMY-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  phase: PHASE,
  bfcacheState: 'default (enabled) — read-only attach to the running soak, no navigation occurs. Declared per RESET-01.',
  whyThisExists: 'A 792.6 ms main-thread task is what a user reports as the page hanging. An averaged ms/s is not. This instrument treats one task as the object of study and counts how often such tasks happen.',
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  // Discover rather than assume. Each soak segment launches its own browser on an ephemeral port.
  const soak = await findSoakBrowser(PORT === 'auto' ? [] : [Number(PORT)]);
  if (!soak) throw new Error('No live soak browser with a chart page found on any chrome-owned port.');
  report.attachedTo = { port: soak.port, chartPages: soak.chartPages, candidates: soak.candidates };
  const startIdentity = soak.identity;
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${soak.port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];
  const barsOf = async () => {
    let t = 0;
    for (const f of page.frames()) t += (await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0)) || 0;
    return t;
  };

  // ---------------------------------------------------------------------------------------------------------
  // FREQUENCY: the browser's own Long Tasks API, over minutes rather than seconds.
  // ---------------------------------------------------------------------------------------------------------
  if (PHASE === 'frequency') {
    const barsBefore = await barsOf();
    const t0 = Date.now();
    const installed = await page.evaluate(() => {
      if (window.__C_LT) return 'already-installed';
      // Bounded buffer: this runs against a ten-hour soak whose memory slope is the measurement, so the
      // observer may not become a memory source itself. Durations only, capped, no entry objects retained.
      window.__C_LT = { entries: [], dropped: 0, startedAt: performance.now() };
      window.__C_LT.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          // START TIME IS KEPT, NOT JUST DURATION. The first version of this used buffered:true and divided a
          // count that included pre-window entries by the window length, which produced 1,019 ms/s of blocking
          // per second - more than a second of work per second, the same impossible signature the trace
          // calibration threw. Entries before the observation start are now identifiable and excluded.
          if (window.__C_LT.entries.length < 20000) window.__C_LT.entries.push([Math.round(e.startTime), Math.round(e.duration)]);
          else window.__C_LT.dropped += 1;
        }
      });
      window.__C_LT.observer.observe({ type: 'longtask', buffered: true });
      return 'installed';
    }).catch((e) => `install-failed: ${String(e && e.message).slice(0, 160)}`);

    if (!/installed/.test(installed)) {
      report.voided = `Long Tasks observer could not be installed: ${installed}. Recorded rather than substituted with an extrapolation from a 5-second trace.`;
    } else {
      await sleep(OBSERVE_MS);
      const got = await page.evaluate(() => {
        const lt = window.__C_LT;
        if (!lt) return null;
        const out = { entries: lt.entries.slice(), dropped: lt.dropped, startedAt: lt.startedAt, observedMs: performance.now() - lt.startedAt };
        try { lt.observer.disconnect(); } catch { /* observer already gone */ }
        delete window.__C_LT;
        return out;
      }).catch(() => null);
      const barsAfter = await barsOf();

      if (!got || !Array.isArray(got.entries)) {
        report.voided = 'The observer was installed but produced no readable result on read-back.';
      } else {
        const buffered = got.entries.filter(([st]) => st < got.startedAt);
        const live = got.entries.filter(([st]) => st >= got.startedAt);
        const d = live.map(([, du]) => du).sort((a, b) => b - a);
        const hours = got.observedMs / 3600000;
        const sec = got.observedMs / 1000;
        const over = (n) => d.filter((x) => x > n).length;
        const rate = (n) => (hours > 0 ? +(over(n) / hours).toFixed(1) : null);
        report.window = {
          startedAt: new Date(t0).toISOString(),
          observedMinutes: +(got.observedMs / 60000).toFixed(1),
          barsBefore, barsAfter, barsDelivered: barsAfter - barsBefore,
          annotateSoakSample: 'Soak samples inside this window carry a PerformanceObserver but no trace; overhead is negligible and no sample needs discarding.',
        };
        report.longTasks = {
          apiThresholdMs: 50,
          count: d.length,
          bufferedEntriesExcluded: buffered.length,
          droppedByCap: got.dropped,
          longestMs: d[0] ?? null,
          medianMs: d.length ? d[Math.floor(d.length / 2)] : null,
          countsByThreshold: { over50: over(50), over100: over(100), over200: over(200), over500: over(500), over1000: over(1000) },
          perHour: { over50: rate(50), over100: rate(100), over200: rate(200), over500: rate(500), over1000: rate(1000) },
          // Same conversion B defined, over a window minutes long rather than seconds long. If this lands near
          // the trace's figure, the short trace was representative and not a window I happened to catch busy.
          blockingMsPerSec: sec > 0 ? +(d.reduce((s, x) => s + Math.max(0, x - 50), 0) / sec).toFixed(1) : null,
          totalLongTaskMsPerSec: sec > 0 ? +(d.reduce((s, x) => s + x, 0) / sec).toFixed(1) : null,
          top20Ms: d.slice(0, 20),
        };
        // Same invariant as the trace calibration: long-task time cannot exceed 1,000 ms per second on one
        // thread. If it does, the count is contaminated and the rate is a counting defect, not a measurement.
        report.longTasks.physicallyPossible = (report.longTasks.totalLongTaskMsPerSec ?? 0) <= 1000;
        report.longTasks.reading = report.longTasks.physicallyPossible
          ? `${report.longTasks.perHour.over500} tasks per hour exceed 500 ms and ${report.longTasks.perHour.over1000} exceed a full second, measured over ${report.window.observedMinutes} minutes rather than extrapolated from a 5-second trace. Blocking time over this long window is ${report.longTasks.blockingMsPerSec} ms/s, against ${report.longTasks.totalLongTaskMsPerSec} ms/s of total long-task time.`
          : `INVALID: ${report.longTasks.totalLongTaskMsPerSec} ms of long-task time per second on one thread is impossible, so this count is contaminated and no rate may be quoted from it.`;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // LOAF: long-animation-frame. Free, in-page, and it carries three things no trace category can give -
  // styleAndLayoutStart (so render and style/layout separate from script without a category guess),
  // per-script forcedStyleAndLayoutDuration (synchronous reflow, attributed to the script that forced it),
  // and windowAttribution per script (self vs descendant), which is the host-versus-panel split.
  // ---------------------------------------------------------------------------------------------------------
  if (PHASE === 'loaf') {
    const barsBefore = await barsOf();
    const t0 = Date.now();
    const supported = await page.evaluate(() => {
      try { return (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame'); } catch { return false; }
    }).catch(() => false);
    report.loafSupported = supported;
    if (!supported) {
      report.voided = 'long-animation-frame is not supported by this browser build. Recorded rather than substituted.';
    } else {
      await page.evaluate(() => {
        if (window.__C_LOAF) return;
        window.__C_LOAF = { frames: [], dropped: 0, startedAt: performance.now() };
        window.__C_LOAF.observer = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (window.__C_LOAF.frames.length >= 4000) { window.__C_LOAF.dropped += 1; continue; }
            window.__C_LOAF.frames.push({
              st: Math.round(e.startTime),
              dur: Math.round(e.duration),
              blocking: Math.round(e.blockingDuration || 0),
              renderStart: Math.round(e.renderStart || 0),
              styleLayoutStart: Math.round(e.styleAndLayoutStart || 0),
              scripts: (e.scripts || []).map((s) => ({
                dur: Math.round(s.duration),
                forced: Math.round(s.forcedStyleAndLayoutDuration || 0),
                pause: Math.round(s.pauseDuration || 0),
                invokerType: s.invokerType || null,
                invoker: String(s.invoker || '').slice(0, 120),
                url: String(s.sourceURL || '').split('/').pop().slice(0, 80),
                fn: String(s.sourceFunctionName || '').slice(0, 80),
                attr: s.windowAttribution || null,
              })),
            });
          }
        });
        window.__C_LOAF.observer.observe({ type: 'long-animation-frame', buffered: true });
      });
      await sleep(OBSERVE_MS);
      const got = await page.evaluate(() => {
        const o = window.__C_LOAF;
        if (!o) return null;
        const out = { frames: o.frames.slice(), dropped: o.dropped, startedAt: o.startedAt, observedMs: performance.now() - o.startedAt };
        try { o.observer.disconnect(); } catch { /* gone */ }
        delete window.__C_LOAF;
        return out;
      }).catch(() => null);
      const barsAfter = await barsOf();
      // A segment roll mid-observation empties the result. It must void loudly, not read as a quiet page.
      const stillThere = await findSoakBrowser([soak.port]);
      assertSameBrowser(startIdentity, stillThere?.identity);

      if (!got || !got.frames.length) {
        report.voided = 'The long-animation-frame observer produced no frames, and the browser identity is unchanged, so the page genuinely produced no long animation frames.';
      } else {
        // Same exclusion as the long-task phase: buffered:true replays entries from before observation began.
        const frames = got.frames.filter((f) => f.st >= got.startedAt);
        const sec = got.observedMs / 1000;
        const sum = (a) => a.reduce((s, x) => s + x, 0);
        const totalDur = sum(frames.map((f) => f.dur));
        // The three phases the entry itself delimits, so none of this is a category guess.
        const scriptMs = sum(frames.map((f) => (f.renderStart > 0 ? f.renderStart - f.st : f.dur)));
        const renderMs = sum(frames.map((f) => (f.renderStart > 0 && f.styleLayoutStart > 0 ? f.styleLayoutStart - f.renderStart : 0)));
        const styleLayoutMs = sum(frames.map((f) => (f.styleLayoutStart > 0 ? (f.st + f.dur) - f.styleLayoutStart : 0)));
        const allScripts = frames.flatMap((f) => f.scripts);
        const forcedMs = sum(allScripts.map((s) => s.forced));

        const agg = (keyFn) => {
          const m = new Map();
          for (const s of allScripts) {
            const k = keyFn(s);
            const cur = m.get(k) || { ms: 0, forcedMs: 0, count: 0 };
            cur.ms += s.dur; cur.forcedMs += s.forced; cur.count += 1;
            m.set(k, cur);
          }
          return [...m.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)
            .map(([k, v]) => ({ key: k, ms: v.ms, msPerSec: +(v.ms / sec).toFixed(1), forcedMs: v.forcedMs, calls: v.count }));
        };

        report.window = {
          startedAt: new Date(t0).toISOString(),
          observedMinutes: +(got.observedMs / 60000).toFixed(1),
          barsBefore, barsAfter, barsDelivered: barsAfter - barsBefore,
        };
        report.loaf = {
          frames: frames.length,
          bufferedExcluded: got.frames.length - frames.length,
          droppedByCap: got.dropped,
          longestFrameMs: Math.max(...frames.map((f) => f.dur)),
          medianFrameMs: frames.map((f) => f.dur).sort((a, b) => a - b)[Math.floor(frames.length / 2)],
          framesPerSec: +(frames.length / sec).toFixed(2),
          totalLoafMsPerSec: +(totalDur / sec).toFixed(1),
          blockingMsPerSec: +(sum(frames.map((f) => f.blocking)) / sec).toFixed(1),
          // NAMES MATTER HERE AND THE OBVIOUS ONES ARE WRONG. The middle phase, renderStart ->
          // styleAndLayoutStart, is where requestAnimationFrame and ResizeObserver CALLBACKS run. It is
          // author JavaScript, not paint. Calling it "render" would have published a 41.8% rendering cost on
          // a page whose real style-and-layout cost is 1.2%, and it would have contradicted my own trace
          // decomposition for no reason.
          phaseSplitMsPerSec: {
            scriptBeforeRender: +(scriptMs / sec).toFixed(1),
            renderCallbacksJs: +(renderMs / sec).toFixed(1),
            styleAndLayout: +(styleLayoutMs / sec).toFixed(1),
          },
          phaseSplitPercent: totalDur > 0 ? {
            scriptBeforeRender: +((scriptMs / totalDur) * 100).toFixed(1),
            renderCallbacksJs: +((renderMs / totalDur) * 100).toFixed(1),
            styleAndLayout: +((styleLayoutMs / totalDur) * 100).toFixed(1),
          } : null,
          forcedStyleAndLayoutMsPerSec: +(forcedMs / sec).toFixed(1),
          forcedPercentOfScript: scriptMs > 0 ? +((forcedMs / scriptMs) * 100).toFixed(1) : null,
          // THE PER-FRAME SPLIT, free: 'self' is the host document, 'descendant' is a panel iframe.
          byWindowAttribution: agg((s) => s.attr || 'unknown'),
          byInvokerType: agg((s) => s.invokerType || 'unknown'),
          bySource: agg((s) => `${s.fn || '(anonymous)'} @ ${s.url || '?'}`),
          byInvoker: agg((s) => s.invoker || '(none)'),
          physicallyPossible: (totalDur / sec) <= 1000,
        };
        const p = report.loaf.phaseSplitPercent || {};
        report.loaf.reading = `Delimited by the entry's own renderStart and styleAndLayoutStart rather than inferred from event names: ${p.scriptBeforeRender}% is script before the rendering opportunity, ${p.renderCallbacksJs}% is rendering-phase CALLBACKS (requestAnimationFrame and friends - author JavaScript, not paint), and only ${p.styleAndLayout}% is real style and layout. Read correctly that is ~${(Number(p.scriptBeforeRender) + Number(p.renderCallbacksJs)).toFixed(1)}% JavaScript, which AGREES with the trace decomposition instead of contradicting it. Synchronous forced reflow inside scripts is ${report.loaf.forcedStyleAndLayoutMsPerSec} ms/s, ${report.loaf.forcedPercentOfScript}% of script time - a cost no category split had shown.`;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // ANATOMY: one specific long task, its tree, its category split, and the stacks sampled inside it.
  // ---------------------------------------------------------------------------------------------------------
  if (PHASE === 'anatomy') {
    const client = await browser.target().createCDPSession();
    const attempts = [];
    let chosen = null;

    for (let attempt = 1; attempt <= ATTEMPTS && !chosen; attempt += 1) {
      const events = [];
      const onData = (e) => { for (const ev of e.value || []) events.push(ev); };
      client.on('Tracing.dataCollected', onData);
      const barsBefore = await barsOf();
      const t0 = Date.now();

      // SECOND SAMPLING ROUTE. The trace-embedded v8.cpu_profiler category emitted zero ProfileChunk events on
      // this build, so the first run of this instrument dissected a task and had no stacks for it. The V8
      // sampling profiler is run alongside the trace instead, and because both are stamped from base::TimeTicks
      // the samples can be attributed to a specific task - but that shared clock is ASSERTED below rather than
      // assumed, because attributing samples to the wrong task would be worse than having no stacks at all.
      const pcdp = await page.createCDPSession().catch(() => null);
      if (pcdp) {
        await pcdp.send('Profiler.enable').catch(() => {});
        await pcdp.send('Profiler.setSamplingInterval', { interval: 500 }).catch(() => {});
        await pcdp.send('Profiler.start').catch(() => {});
      }
      await client.send('Tracing.start', {
        transferMode: 'ReportEvents',
        traceConfig: {
          recordMode: 'recordAsMuchAsPossible',
          includedCategories: [
            'toplevel',
            'devtools.timeline',
            'disabled-by-default-devtools.timeline',
            'disabled-by-default-devtools.timeline.stack',
            // The CPU profiler INSIDE the trace: samples and task boundaries then share a single clock, so a
            // sample can be attributed to a specific task without correlating two independent timebases.
            'disabled-by-default-v8.cpu_profiler',
            'v8', 'v8.execute', 'disabled-by-default-v8.gc',
          ],
        },
      });
      await sleep(TRACE_MS);
      const ended = new Promise((res) => client.once('Tracing.tracingComplete', res));
      await client.send('Tracing.end');
      await ended;
      client.off('Tracing.dataCollected', onData);
      let v8profile = null;
      if (pcdp) {
        v8profile = (await pcdp.send('Profiler.stop').catch(() => null))?.profile || null;
        await pcdp.send('Profiler.disable').catch(() => {});
        await pcdp.detach().catch(() => {});
      }
      const t1 = Date.now();
      const barsAfter = await barsOf();

      // Busiest CrRendererMain, same selection rule as the calibrated trace.
      const busy = new Map();
      for (const e of events) {
        if (e.ph !== 'X' || !(e.dur > 0)) continue;
        const k = `${e.pid}:${e.tid}`;
        busy.set(k, (busy.get(k) || 0) + e.dur);
      }
      const mainKey = [...busy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (!mainKey) { attempts.push({ attempt, error: 'no threads in trace' }); continue; }
      const [mpid, mtid] = mainKey.split(':').map(Number);

      // Outermost tasks only - RunTask and ThreadControllerImpl::RunTask nest and summing both double counts.
      const rawTasks = events.filter((e) => e.ph === 'X' && e.pid === mpid && e.tid === mtid && /^(RunTask|ThreadControllerImpl::RunTask)$/.test(e.name) && e.dur > 0)
        .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
      const tasks = [];
      let covered = -Infinity;
      for (const e of rawTasks) { if (e.ts < covered) continue; covered = e.ts + e.dur; tasks.push(e); }
      const longest = tasks.slice().sort((a, b) => b.dur - a.dur)[0] || null;
      attempts.push({
        attempt, wallMs: t1 - t0, traceEvents: events.length, tasks: tasks.length,
        longestTaskMs: longest ? +(longest.dur / 1000).toFixed(1) : null,
        over500: tasks.filter((t) => t.dur > 500000).length,
        barsDelivered: barsAfter - barsBefore,
      });
      const win = { startedAt: new Date(t0).toISOString(), wallMs: t1 - t0, barsBefore, barsAfter, barsDelivered: barsAfter - barsBefore };
      if (longest && longest.dur >= MIN_TASK_MS * 1000) {
        chosen = { events, mpid, mtid, task: longest, tasks, window: win, v8profile };
      } else if (attempt < ATTEMPTS) {
        await sleep(2000);
      } else if (longest) {
        chosen = { events, mpid, mtid, task: longest, tasks, window: win, v8profile, belowThreshold: true };
      }
    }
    await client.detach().catch(() => {});
    report.attempts = attempts;

    if (!chosen) {
      report.voided = `No main-thread task was captured in ${ATTEMPTS} attempts. Recorded rather than reported from the earlier window.`;
    } else {
      const { events, mpid, mtid, task, tasks } = chosen;
      report.window = chosen.window;
      report.windowTaskProfile = {
        tasks: tasks.length,
        over500Ms: tasks.filter((t) => t.dur > 500000).length,
        over1000Ms: tasks.filter((t) => t.dur > 1000000).length,
        note: 'Counts within this trace window only. The per-hour rate comes from the frequency phase, which observes for minutes; extrapolating a per-hour rate from seconds of trace is arithmetic rather than measurement.',
      };
      report.theTask = {
        durationMs: +(task.dur / 1000).toFixed(1),
        belowRequestedThreshold: !!chosen.belowThreshold,
        thresholdMs: MIN_TASK_MS,
      };

      const t0us = task.ts;
      const t1us = task.ts + task.dur;
      const inside = events.filter((e) => e.ph === 'X' && e.pid === mpid && e.tid === mtid && e.dur > 0
        && e.ts >= t0us && (e.ts + e.dur) <= t1us && !CONTAINERS.test(e.name))
        .sort((a, b) => a.ts - b.ts || b.dur - a.dur);

      // Self time by containment: a parent's cost minus the children it encloses.
      const selfOf = new Map();
      for (let i = 0; i < inside.length; i += 1) {
        const e = inside[i];
        let childSum = 0;
        let cursor = e.ts;
        for (let j = i + 1; j < inside.length; j += 1) {
          const c = inside[j];
          if (c.ts >= e.ts + e.dur) break;
          if (c.ts < cursor) continue;
          if (c.ts + c.dur <= e.ts + e.dur) { childSum += c.dur; cursor = c.ts + c.dur; }
        }
        selfOf.set(e, Math.max(0, e.dur - childSum));
      }
      const byCat = {};
      for (const [e, self] of selfOf.entries()) {
        const c = categoryOf(e.name);
        byCat[c] = (byCat[c] || 0) + self;
      }
      const catTotal = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
      report.theTask.categorySplitPercent = Object.fromEntries(Object.entries(byCat)
        .sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +((v / catTotal) * 100).toFixed(1)]));
      report.theTask.categorySplitMs = Object.fromEntries(Object.entries(byCat)
        .sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1000).toFixed(1)]));

      // The tree, outermost first, so the SHAPE of the task is visible and not only its totals.
      const outer = [];
      let cov = -Infinity;
      for (const e of inside) { if (e.ts < cov) continue; cov = e.ts + e.dur; outer.push(e); }
      report.theTask.topLevelChildren = outer.slice(0, 12).map((e) => ({
        name: e.name, category: categoryOf(e.name), ms: +(e.dur / 1000).toFixed(1),
        percentOfTask: +((e.dur / task.dur) * 100).toFixed(1),
        detail: e.args?.data?.functionName || e.args?.data?.url || e.args?.data?.type || null,
      }));
      report.theTask.hottestEventsBySelfTime = [...selfOf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([e, self]) => ({ name: e.name, category: categoryOf(e.name), selfMs: +(self / 1000).toFixed(1), detail: e.args?.data?.functionName || e.args?.data?.url || null }));

      // CPU samples taken DURING this task, reconstructed from the trace-embedded profiler.
      const nodes = new Map();
      const samples = [];
      let cursorTs = null;
      for (const e of events) {
        if (e.pid !== mpid || e.tid !== mtid) continue;
        if (e.name === 'Profile' && e.args?.data?.startTime != null) cursorTs = e.args.data.startTime;
        if (e.name === 'ProfileChunk') {
          const cp = e.args?.data?.cpuProfile || {};
          for (const n of cp.nodes || []) nodes.set(n.id, n);
          const s = cp.samples || [];
          const td = e.args?.data?.timeDeltas || [];
          for (let i = 0; i < s.length; i += 1) {
            if (cursorTs == null) break;
            cursorTs += (td[i] || 0);
            samples.push({ ts: cursorTs, node: s[i] });
          }
        }
      }
      // FALLBACK ROUTE: the V8 sampling profiler run alongside the trace. Used only if its clock is PROVEN to
      // be the trace's clock, by checking that its window overlaps the trace's own event timestamps. Two
      // timebases that merely look similar would silently attribute samples to the wrong task.
      const prof = chosen.v8profile;
      let clockCheck = null;
      if (!samples.length && prof && Array.isArray(prof.samples) && prof.samples.length) {
        // Folded rather than spread: `Math.min(...events)` on a 160,000-event trace exceeds the call stack,
        // and because that throw happened inside the try it silently cost the whole stacks section.
        let traceLo = Infinity;
        let traceHi = -Infinity;
        for (const e of events) {
          if (!(e.ts > 0)) continue;
          if (e.ts < traceLo) traceLo = e.ts;
          const end = e.ts + (e.dur || 0);
          if (end > traceHi) traceHi = end;
        }
        const overlaps = prof.startTime < traceHi && prof.endTime > traceLo;
        clockCheck = {
          traceSpanUs: [traceLo, traceHi],
          profileSpanUs: [prof.startTime, prof.endTime],
          overlaps,
          reading: overlaps
            ? 'The profiler window overlaps the trace window on the raw microsecond timestamps, so both are base::TimeTicks and a sample can be attributed to a specific task.'
            : 'The profiler window does NOT overlap the trace window, so the two are on different timebases. Samples are NOT attributed to the task - a wrong attribution is worse than no stack.',
        };
        if (overlaps) {
          const parentOf = new Map();
          for (const n of prof.nodes || []) { nodes.set(n.id, n); for (const c of (n.children || [])) parentOf.set(c, n.id); }
          for (const n of prof.nodes || []) if (!nodes.get(n.id)?.parent && parentOf.has(n.id)) nodes.set(n.id, { ...n, parent: parentOf.get(n.id) });
          let cur = prof.startTime;
          for (let i = 0; i < prof.samples.length; i += 1) {
            cur += (prof.timeDeltas?.[i] || 0);
            samples.push({ ts: cur, node: prof.samples[i] });
          }
        }
      }
      report.theTask.samplingRoute = samples.length
        ? (clockCheck ? 'V8 sampling profiler, clock alignment verified against the trace' : 'trace-embedded v8.cpu_profiler')
        : 'none';
      if (clockCheck) report.theTask.clockAlignment = clockCheck;

      const insideSamples = samples.filter((s) => s.ts >= t0us && s.ts <= t1us);
      if (!insideSamples.length) {
        report.theTask.stacks = { unavailable: 'The trace-embedded profiler produced no samples inside this task window. Recorded as unavailable rather than backfilled from the window-wide profile, which would be an aggregate again and is exactly what this instrument exists to avoid.', samplesInTrace: samples.length };
      } else {
        const hits = new Map();
        for (const s of insideSamples) hits.set(s.node, (hits.get(s.node) || 0) + 1);
        const total = insideSamples.length;
        const frameOf = (id) => { const cf = nodes.get(id)?.callFrame || {}; return `${cf.functionName || '(anonymous)'} @ ${short(cf.url)}:${cf.lineNumber != null ? cf.lineNumber + 1 : '?'}`; };
        const stackOf = (id) => {
          const out = [];
          let cur = id;
          const seen = new Set();
          while (cur != null && !seen.has(cur) && out.length < 24) { seen.add(cur); out.push(frameOf(cur)); cur = nodes.get(cur)?.parent; }
          return out;
        };
        // Aggregate by function identity: one function reached by several call paths is understated by
        // per-node rows, which is the defect I already fixed once in the window-wide profiler.
        const byFn = new Map();
        for (const [id, h] of hits.entries()) {
          const f = frameOf(id);
          const cur = byFn.get(f) || { hits: 0, heaviestNode: null, heaviestHits: 0 };
          cur.hits += h;
          if (h > cur.heaviestHits) { cur.heaviestHits = h; cur.heaviestNode = id; }
          byFn.set(f, cur);
        }
        const ranked = [...byFn.entries()].sort((a, b) => b[1].hits - a[1].hits);
        report.theTask.stacks = {
          samplesInsideTask: total,
          samplingNote: 'Samples are those whose timestamp falls INSIDE this one task, on the same clock as the task boundary, so this is the stack of the freeze rather than of the window.',
          aggregatedByFunction: ranked.slice(0, 10).map(([f, v]) => ({
            frame: f,
            selfPercentOfTask: +((v.hits / total) * 100).toFixed(1),
            selfMsOfTask: +((v.hits / total) * (task.dur / 1000)).toFixed(1),
          })),
          // The stack of the hottest FUNCTION, not of the hottest node. Those differ whenever a function is
          // reached by several paths - the first run of this printed "(program) -> (root)" because the busiest
          // single node was the profiler's own idle marker while the busiest function was split across callers.
          stacksOfTopFunctions: ranked.slice(0, 3).map(([f, v]) => ({
            frame: f,
            selfPercentOfTask: +((v.hits / total) * 100).toFixed(1),
            stack: stackOf(v.heaviestNode),
          })),
        };

        // EVERY freeze in the window, not only the longest. One task is an anecdote; the question the
        // Director is really asking is whether freezes share a cause, and that needs n>1 from the same
        // attach. Consecutive runs of this probe catch DIFFERENT tasks, so cross-run agreement is evidence
        // and within-run agreement across several tasks is more.
        const all = tasks.filter((tk) => tk.dur >= MIN_TASK_MS * 1000).sort((a, b) => b.dur - a.dur).slice(0, 8);
        report.everyLongTaskInWindow = all.map((tk) => {
          const lo = tk.ts;
          const hi = tk.ts + tk.dur;
          const ins = events.filter((e) => e.ph === 'X' && e.pid === mpid && e.tid === mtid && e.dur > 0
            && e.ts >= lo && (e.ts + e.dur) <= hi && !CONTAINERS.test(e.name)).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
          const cat = {};
          for (let i = 0; i < ins.length; i += 1) {
            const e = ins[i];
            let child = 0;
            let cur2 = e.ts;
            for (let j = i + 1; j < ins.length; j += 1) {
              const c = ins[j];
              if (c.ts >= e.ts + e.dur) break;
              if (c.ts < cur2) continue;
              if (c.ts + c.dur <= e.ts + e.dur) { child += c.dur; cur2 = c.ts + c.dur; }
            }
            const k = categoryOf(e.name);
            cat[k] = (cat[k] || 0) + Math.max(0, e.dur - child);
          }
          const ct = Object.values(cat).reduce((a, b) => a + b, 0) || 1;
          const sIn = samples.filter((s) => s.ts >= lo && s.ts <= hi);
          const hh = new Map();
          for (const s of sIn) { const f = frameOf(s.node); hh.set(f, (hh.get(f) || 0) + 1); }
          return {
            durationMs: +(tk.dur / 1000).toFixed(1),
            categoryPercent: Object.fromEntries(Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +((v / ct) * 100).toFixed(1)])),
            samples: sIn.length,
            topFunctions: [...hh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
              .map(([f, h]) => ({ frame: f, selfPercentOfTask: sIn.length ? +((h / sIn.length) * 100).toFixed(1) : null })),
          };
        });
      }
    }
  }
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 900);
} finally {
  // Disconnect, never close: the soak owns this browser.
  try { if (browser) await browser.disconnect(); } catch { /* already gone */ }
}

report.signatureFilenameCheck = report.artifactFile === OUT.split('\\').pop() ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
