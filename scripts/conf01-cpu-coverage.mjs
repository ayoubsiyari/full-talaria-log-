#!/usr/bin/env node
/**
 * CONF01-CPU-COVERAGE-V1 — close the coverage gap in my own CPU attribution (C4).
 *
 * The CONF-01 reference row split the renderer into main thread 43.6%, threadpool
 * GC 7.6%, compositor 6.7% and no raster at all — but the traced threads summed to
 * 60.3% against a process-level 127.5%, so HALF the renderer's CPU was outside the
 * categories I enabled. A role split that covers half the process is a ranking, not
 * an attribution, and A cannot aim at the unnamed half.
 *
 * This runs the same CONF-01 workload twice in one session: once with the narrow
 * category set that produced the published figures, once with a widened set. It
 * reports the coverage ratio of each against the same process-level ground truth,
 * so the widening is judged by how much of the process it explains rather than by
 * how many slices it produced.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - process-level CPU per Chrome process from cpuTime deltas, which is
 *     category-independent and is the check on every trace figure here
 *   - per-thread merged busy coverage and per-event self time inside the traced
 *     processes
 * WHAT IT CANNOT SEE:
 *   - work that no enabled category instruments; the residual is reported as
 *     UNATTRIBUTED rather than distributed across the roles that happen to exist
 *   - the PO's machine: different core count, so shares travel and absolutes do not
 *
 * SETTLE PROTOCOL: boot CONF-01, verify four panels advancing, 5s settle, then two
 * fixed 12s trace windows with no interaction inside either, narrow arm first so a
 * warm-up effect cannot flatter the widened arm.
 */
import fs from 'node:fs';

import {
  bootConf01Session, keepConf01Playing, probePanelAdvanceRates, readConf01State,
} from './lib/conf01-session.mjs';
import { summarizeTraceThreadCpu } from './lib/cpu-thread-census.mjs';
import { diffProcessCpu, summariseCpuByRole, processCpuSample } from './cpu-process-census.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The set that produced the published CONF-01 role split. */
export const NARROW_CATEGORIES = ['toplevel', 'cc', 'gpu', 'viz', 'blink', 'devtools.timeline'];

/**
 * Widened set. Each addition is here for a named reason, because a category list
 * grown by reflex is how a coverage gap gets papered over with slices that do not
 * explain any more of the process.
 */
export const WIDE_CATEGORIES = [
  ...NARROW_CATEGORIES,
  'v8',                    // compile, parse and GC accounting the narrow set omits
  'v8.execute',            // script execution outside devtools.timeline's slices
  'blink.user_timing',
  'blink_gc',              // Oilpan collection, invisible to the narrow set
  'sequence_manager',      // task queue work between toplevel slices
  'scheduler',
  'base',                  // thread pool tasks with no product-level slice
  'ipc',                   // cross-process message handling
  'mojom',
  'skia',                  // paint/record work if any exists off the raster threads
  'gpu.service',           // GPU-process service side, a third of which was missing
  'viz.triangles',
  'latency',
];

async function traceWindow(browserCdp, { categories, windowMs, label }) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  const before = await processCpuSample(browserCdp);
  const startedAt = Date.now();
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: categories },
  });
  await sleep(windowMs);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - startedAt;
  const processCpu = diffProcessCpu(before, await processCpuSample(browserCdp), wallMs);
  const census = summarizeTraceThreadCpu(events, { wallMs, topEventsPerThread: 10 });
  const byRole = summariseCpuByRole(census.threads, wallMs);

  // diffProcessCpu reports per-process rows; sum them by type for the ground truth.
  const sumType = (re) => +(processCpu.perProcess || [])
    .filter((r) => re.test(String(r.type)))
    .reduce((s, r) => s + (r.cpuPercentOfCore || 0), 0)
    .toFixed(1);
  const rendererProcess = sumType(/renderer/i);
  const gpuProcess = sumType(/gpu/i);
  const roleSum = (re) => +byRole.roles
    .filter((r) => re.test(r.role))
    .reduce((s, r) => s + (r.percentOfCore || 0), 0)
    .toFixed(1);
  const tracedRenderer = roleSum(/^renderer-/);
  const tracedGpu = roleSum(/^gpu-/);

  const arm = {
    label,
    categories,
    wallMs,
    traceEventCount: events.length,
    processCpu,
    roles: byRole.roles,
    tracedRendererPercent: tracedRenderer,
    tracedGpuPercent: tracedGpu,
    // The number that matters: how much of the process the trace explains.
    rendererProcessPercent: rendererProcess,
    gpuProcessPercent: gpuProcess,
    rendererCoverage: rendererProcess > 0 ? +(tracedRenderer / rendererProcess).toFixed(3) : null,
    gpuCoverage: gpuProcess > 0 ? +(tracedGpu / gpuProcess).toFixed(3) : null,
    unattributedRendererPercent: rendererProcess > 0 ? +(rendererProcess - tracedRenderer).toFixed(1) : null,
    unattributedGpuPercent: gpuProcess > 0 ? +(gpuProcess - tracedGpu).toFixed(1) : null,
    topEventsPerThread: census.threads.slice(0, 6).map((t) => ({
      thread: t.threadName,
      process: t.processName,
      percentOfCore: t.percentOfCore,
      top: (t.topEvents || []).slice(0, 6),
    })),
  };
  console.error(
    `[cpu-coverage] ${label}: renderer process=${rendererProcess}% traced=${tracedRenderer}% `
    + `coverage=${arm.rendererCoverage} | gpu process=${gpuProcess}% traced=${tracedGpu}% coverage=${arm.gpuCoverage} `
    + `| events=${events.length}`,
  );
  return arm;
}

export async function runConf01CpuCoverage({ windowMs = 12_000, speed = 60, outPath = null } = {}) {
  const { browser, page, cdp, browserCdp, conf01 } = await bootConf01Session({ speed });
  const report = {
    signature: 'CONF01-CPU-COVERAGE-V1',
    startedAtIso: new Date().toISOString(),
    conf01,
    windowMs,
    arms: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  try {
    if (!conf01?.compliant) {
      console.error(`[cpu-coverage] CONF-01 NOT compliant: ${JSON.stringify(conf01?.failures || conf01)}`);
    }
    await keepConf01Playing(page, speed);
    await sleep(5_000);
    report.advanceBefore = await probePanelAdvanceRates(page, { windowMs: 4_000, replaySpeed: speed });
    report.stateBefore = await readConf01State(page, { advanceWindowMs: 3_000 });

    // Narrow first: a warm-up effect would otherwise credit the widened arm.
    report.arms.push(await traceWindow(browserCdp, { categories: NARROW_CATEGORIES, windowMs, label: 'narrow (published set)' }));
    save();
    await keepConf01Playing(page, speed);
    await sleep(3_000);
    report.arms.push(await traceWindow(browserCdp, { categories: WIDE_CATEGORIES, windowMs, label: 'widened' }));
    save();

    report.stateAfter = await readConf01State(page, { advanceWindowMs: 3_000 });
    const [narrow, wide] = report.arms;
    report.conclusion = {
      rendererCoverage: { narrow: narrow.rendererCoverage, wide: wide.rendererCoverage },
      gpuCoverage: { narrow: narrow.gpuCoverage, wide: wide.gpuCoverage },
      rendererStillUnattributedPercent: wide.unattributedRendererPercent,
      gpuStillUnattributedPercent: wide.unattributedGpuPercent,
      // Both arms must have been measured on a working workload or the comparison
      // is between a playing renderer and a stalled one.
      bothArmsAdvancing: (report.stateBefore?.advancingPanels ?? 0) === 4
        && (report.stateAfter?.advancingPanels ?? 0) === 4,
      verdict: wide.rendererCoverage == null
        ? 'INDETERMINATE: no process-level renderer figure'
        : (wide.rendererCoverage >= 0.85
          ? 'COVERED: the widened set explains >= 85% of renderer CPU, so the role split is an attribution'
          : 'STILL PARTIAL: report the unattributed remainder on every role figure'),
    };
    console.error(`[cpu-coverage] ${report.conclusion.verdict}`);
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
    if (k === 'window-ms') o.windowMs = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /conf01-cpu-coverage\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const report = await runConf01CpuCoverage(parseArgs(process.argv.slice(2)));
  console.error(`[cpu-coverage] done: ${report.conclusion?.verdict}`);
}
