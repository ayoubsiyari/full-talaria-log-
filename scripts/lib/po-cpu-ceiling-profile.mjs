/**
 * PO-CPU-CEILING-PROFILE-V1 — extend PO-CPU-AB with CDP Profiler + Timeline
 * categories for the single-chart 60× replay ceiling (~111% CPU / PO).
 *
 * Emits Scripting vs Rendering vs Painting vs System (donut analogue) and
 * ranked call-path samples. Does not replace workRatio acceptance cells.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLocalChromiumBrowser,
} from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startPoCpuAbBenchmarkServer } from './po-cpu-ab-benchmark.mjs';

export const PO_CPU_CEILING_SIGNATURE = 'TALARIA_PO_CPU_CEILING_PROFILE_V1';
export const PO_CPU_CEILING_DEFAULT_SPEED = 60;
export const PO_CPU_CEILING_DEFAULT_OBSERVE_MS = 8_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_PKG = path.resolve(
  __dirname,
  '../../chart v 1.4/chart/multichart-prod/harness/package.json',
);
const require = createRequire(HARNESS_PKG);

async function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch (error) {
    throw new Error(`puppeteer unavailable under harness package: ${error?.message || error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map Chrome DevTools Timeline event names → donut buckets. */
export function classifyTimelineEventName(name) {
  const n = String(name || '');
  if (/^V8\.|^v8\.|EvaluateScript|FunctionCall|JSFrame|RunMicrotasks|FireAnimationFrame|TimerFire|EventDispatch|MinorGC|MajorGC|GC_/.test(n)) {
    return 'scripting';
  }
  if (/^Layout$|UpdateLayoutTree|RecalculateStyles|InvalidateLayout|HitTest|ParseHTML|ParseAuthorStyleSheet/.test(n)) {
    return 'rendering';
  }
  if (/^Paint|UpdateLayer|CompositeLayers|RasterTask|GPUTask|DrawFrame|Layerize|ImageDecode/.test(n)) {
    return 'painting';
  }
  if (/Idle|ScheduledAction|CPUProfile|TracingStarted|RunTask|ThreadController/.test(n)) {
    return 'system';
  }
  return 'other';
}

/**
 * Aggregate Tracing completeEvent durations into Scripting/Rendering/Painting/System.
 * @param {Array<object>} events
 */
export function summarizeTimelineCategories(events) {
  const buckets = {
    scripting: 0,
    rendering: 0,
    painting: 0,
    system: 0,
    other: 0,
  };
  const byName = new Map();
  for (const ev of events || []) {
    if (!ev || (ev.ph !== 'X' && ev.ph !== 'B' && ev.ph !== 'I')) continue;
    const dur = Number(ev.dur) || 0;
    if (!(dur > 0) && ev.ph === 'X') continue;
    // Durations in trace are µs.
    const ms = (Number(ev.dur) || 0) / 1000;
    if (!(ms > 0)) continue;
    const name = ev.name || ev.cat || '(unknown)';
    const bucket = classifyTimelineEventName(name);
    buckets[bucket] += ms;
    const prev = byName.get(name) || { name, ms: 0, count: 0, bucket };
    prev.ms += ms;
    prev.count += 1;
    byName.set(name, prev);
  }
  const totalMs = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
  const categories = Object.fromEntries(
    Object.entries(buckets).map(([k, ms]) => [k, {
      ms: Number(ms.toFixed(3)),
      ratio: Number((ms / totalMs).toFixed(4)),
    }]),
  );
  const topEvents = [...byName.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 25)
    .map((row) => ({
      name: row.name,
      bucket: row.bucket,
      ms: Number(row.ms.toFixed(3)),
      count: row.count,
      ratio: Number((row.ms / totalMs).toFixed(4)),
    }));
  return { categories, topEvents, totalCategoryMs: Number(totalMs.toFixed(3)) };
}

/**
 * Rank CPU profile nodes by self time (hit count × sample interval proxy).
 * @param {object} profile CDP Profiler.Profile
 */
export function summarizeCpuProfile(profile, { topN = 40 } = {}) {
  const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const timeDeltas = Array.isArray(profile?.timeDeltas) ? profile.timeDeltas : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    const dt = Number(timeDeltas[i]) || 0;
    selfUs.set(id, (selfUs.get(id) || 0) + dt);
  }
  const rows = [];
  for (const [id, us] of selfUs) {
    const node = byId.get(id);
    if (!node) continue;
    const fn = node.callFrame || {};
    const functionName = fn.functionName || '(anonymous)';
    const url = fn.url || '';
    const line = fn.lineNumber != null ? fn.lineNumber + 1 : null;
    rows.push({
      functionName,
      url,
      lineNumber: line,
      selfMs: Number((us / 1000).toFixed(3)),
      hitCount: node.hitCount || 0,
      callUID: `${functionName}@${url}:${line ?? '?'}`,
    });
  }
  // Aggregate identical callUIDs (same function across nodes).
  const agg = new Map();
  for (const row of rows) {
    const prev = agg.get(row.callUID);
    if (prev) {
      prev.selfMs += row.selfMs;
      prev.hitCount += row.hitCount;
    } else {
      agg.set(row.callUID, { ...row });
    }
  }
  const totalSelfMs = [...agg.values()].reduce((a, r) => a + r.selfMs, 0) || 1;
  const topCalls = [...agg.values()]
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, topN)
    .map((row) => ({
      ...row,
      selfMs: Number(row.selfMs.toFixed(3)),
      ratio: Number((row.selfMs / totalSelfMs).toFixed(4)),
    }));
  return {
    sampleCount: samples.length,
    totalSelfMs: Number(totalSelfMs.toFixed(3)),
    topCalls,
  };
}

export function deltaProbeSnapshots(before, after) {
  const b = before || {};
  const a = after || {};
  const wallMs = Math.max(1, (Number(a.at) || 0) - (Number(b.at) || 0));
  const callbackBusyMs = Math.max(0, (Number(a.callbackBusyMs) || 0) - (Number(b.callbackBusyMs) || 0));
  const longTaskDurationMs = Math.max(0, (Number(a.longTaskDurationMs) || 0) - (Number(b.longTaskDurationMs) || 0));
  const canvasPaintMs = Math.max(0, (Number(a.canvasPaintMs) || 0) - (Number(b.canvasPaintMs) || 0));
  const canvasPaintCalls = Math.max(0, (Number(a.canvasPaintCalls) || 0) - (Number(b.canvasPaintCalls) || 0));
  const rafCallbacks = Math.max(0, (Number(a.rafCallbacks) || 0) - (Number(b.rafCallbacks) || 0));
  const intervalCallbacks = Math.max(0, (Number(a.intervalCallbacks) || 0) - (Number(b.intervalCallbacks) || 0));
  const timeoutCallbacks = Math.max(0, (Number(a.timeoutCallbacks) || 0) - (Number(b.timeoutCallbacks) || 0));
  // stackRows on snapshot are cumulative totals — re-diff by re-reading keys is lossy;
  // use after.stackRows filtered to positive selfMs as phase-dominant (probe resets not available).
  const beforeMap = new Map((b.stackRows || []).map((r) => [r.key, Number(r.selfMs) || 0]));
  const stackRows = (a.stackRows || [])
    .map((r) => ({
      key: r.key,
      selfMs: Math.max(0, (Number(r.selfMs) || 0) - (beforeMap.get(r.key) || 0)),
    }))
    .filter((r) => r.selfMs > 0)
    .sort((x, y) => y.selfMs - x.selfMs)
    .slice(0, 40);
  return {
    wallMs,
    callbackBusyMs,
    longTaskDurationMs,
    canvasPaintMs,
    canvasPaintCalls,
    rafCallbacks,
    intervalCallbacks,
    timeoutCallbacks,
    stackRows,
    workRatio: callbackBusyMs / wallMs,
  };
}

/**
 * Scripting = probe callbackBusyMs (timer/rAF). Painting = wrapped canvas ms.
 * Rendering unmeasured without style/layout Tracing — reported 0.
 * System = wall − scripting − painting (clamped).
 */
export function categoriesFromProbeDelta(delta = {}) {
  const wallMs = Math.max(1, Number(delta.wallMs) || 1);
  const scriptingMs = Math.max(0, Number(delta.callbackBusyMs) || 0);
  const paintingMs = Math.max(0, Number(delta.canvasPaintMs) || 0);
  const renderingMs = 0;
  const accounted = scriptingMs + paintingMs;
  const systemMs = Math.max(0, wallMs - accounted);
  const buckets = {
    scripting: scriptingMs,
    rendering: renderingMs,
    painting: paintingMs,
    system: systemMs,
    other: 0,
  };
  const totalMs = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
  const categories = Object.fromEntries(
    Object.entries(buckets).map(([k, ms]) => [k, {
      ms: Number(ms.toFixed(3)),
      ratio: Number((ms / totalMs).toFixed(4)),
    }]),
  );
  const stackTotal = (delta.stackRows || []).reduce((s, r) => s + r.selfMs, 0) || 1;
  return {
    categories,
    topEvents: (delta.stackRows || []).slice(0, 15).map((row) => ({
      name: row.key,
      bucket: 'scripting',
      ms: Number(row.selfMs.toFixed(3)),
      count: 1,
      ratio: Number((row.selfMs / stackTotal).toFixed(4)),
    })),
    totalCategoryMs: Number(totalMs.toFixed(3)),
    derivation: 'probe callbackBusy=scripting; canvas wrappers=painting; layout/rendering unmeasured',
    longtaskMs: Number(delta.longTaskDurationMs) || 0,
    workRatio: Number(delta.workRatio) || 0,
  };
}

export function formatCeilingProfileSummary(report) {
  const lines = [PO_CPU_CEILING_SIGNATURE];
  const cats = report?.timeline?.categories || {};
  lines.push('## categories (timeline dur share)');
  for (const key of ['scripting', 'rendering', 'painting', 'system', 'other']) {
    const row = cats[key];
    if (!row) continue;
    lines.push(`  ${key}: ${(row.ratio * 100).toFixed(1)}% (${row.ms.toFixed(1)}ms)`);
  }
  lines.push('## top call paths (CPU profile self time)');
  for (const row of (report?.profile?.topCalls || []).slice(0, 15)) {
    lines.push(
      `  ${(row.ratio * 100).toFixed(1)}% ${row.selfMs.toFixed(1)}ms  ${row.functionName}  ${row.url}:${row.lineNumber ?? '?'}`,
    );
  }
  return lines.join('\n');
}

function harnessChartEval(page, fnSource, ...args) {
  // Chart lives in #harness iframe (po-cpu-ab-host.html), not the outer page.
  return page.evaluate((source, evalArgs) => {
    const harness = document.getElementById('harness');
    const win = harness && harness.contentWindow;
    if (!win) return { ok: false, reason: 'harness iframe missing' };
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${source})`)();
    return fn(win, ...evalArgs);
  }, fnSource, args);
}

async function waitForChartReady(page, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await harnessChartEval(page, `async (win) => {
      return !!(win.__harnessHostReady && !win.__harnessBootError
        && win.chart && Array.isArray(win.chart.data) && win.chart.data.length > 0
        && win.chart.replaySystem);
    }`).catch(() => false);
    if (ok === true) return;
    await sleep(250);
  }
  throw new Error('timeout waiting for po-cpu-ab host chart ready');
}

async function armReplayAtSpeed(page, speed) {
  return harnessChartEval(page, `async (win, targetSpeed) => {
    const ch = win.chart;
    const rs = ch && ch.replaySystem;
    if (!ch || !rs) return { ok: false, reason: 'chart/replaySystem missing' };
    try {
      if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
        rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
      }
      if (typeof rs.seekToIndex === 'function' && Array.isArray(ch.data) && ch.data.length > 10) {
        rs.seekToIndex(Math.max(0, Math.floor(ch.data.length * 0.1)));
      }
      let method = 'unavailable';
      if (typeof rs.setSpeed === 'function') {
        rs.setSpeed(targetSpeed);
        method = 'setSpeed';
      } else if ('speed' in rs) {
        rs.speed = targetSpeed;
        method = 'speed-property';
      }
      if (typeof rs.play === 'function') rs.play();
      else if (typeof rs.togglePlay === 'function') rs.togglePlay();
      else if (typeof rs.start === 'function') rs.start();
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if (rs.isPlaying || rs.passivePlayActive) break;
        if (typeof rs.play === 'function') rs.play();
        else if (typeof rs.togglePlay === 'function') rs.togglePlay();
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        ok: !!(rs.isPlaying || rs.passivePlayActive || rs.isActive),
        requestedSpeed: targetSpeed,
        nearestSpeed: Number(rs.speed) || null,
        method,
        isPlaying: !!rs.isPlaying,
        passivePlayActive: !!rs.passivePlayActive,
      };
    } catch (error) {
      return { ok: false, reason: String(error && error.message || error) };
    }
  }`, speed);
}

/**
 * Live single-chart 60× ceiling profile on the PO-CPU-AB harness host.
 */
export async function runPoCpuCeilingProfile({
  speed = PO_CPU_CEILING_DEFAULT_SPEED,
  observeMs = PO_CPU_CEILING_DEFAULT_OBSERVE_MS,
  timeoutMs = 180_000,
  requireBrowser = false,
  findBrowser = findLocalChromiumBrowser,
} = {}) {
  const startedAt = new Date().toISOString();
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      status: requireBrowser ? 'RED' : 'SKIP',
      signature: PO_CPU_CEILING_SIGNATURE,
      error: 'no Chromium-based browser found',
      report: null,
      cells: [],
    };
  }

  let serverHandle;
  let browser;
  try {
    const puppeteer = await loadPuppeteer();
    serverHandle = await startPoCpuAbBenchmarkServer({
      timings: {
        p1SettleMs: 2000,
        p1ObserveMs: 1000,
        p2IdleMs: 0,
        p2ObserveMs: 1000,
        lagSingleObserveMs: 1000,
        p4ObserveMs: 1000,
        p6ObserveMs: 1000,
        p7SettleMs: 1000,
        p7ObserveMs: 1000,
        shortened: true,
      },
      onReport: () => {},
    });
    const url = `${serverHandle.url}/po-cpu-ab-host.html`;
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: 'new',
      protocolTimeout: Math.max(180_000, timeoutMs),
      args: [
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
        '--window-size=1280,900',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.max(120_000, timeoutMs));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await waitForChartReady(page, Math.min(timeoutMs, 120_000));
    await sleep(1500);

    // In-page autonomous capture: at 60× the main thread saturates and
    // puppeteer Runtime.callFunctionOn times out mid-observe. Arm+sleep+pause
    // must complete inside one evaluate Promise so the round-trip resumes after pause.
    const capture = await harnessChartEval(
      page,
      `async (win, targetSpeed, observeMs) => {
        const p = win.__poCpuAbProbe;
        if (!p || typeof p.snapshot !== 'function') {
          return { ok: false, reason: 'PO CPU probe missing in harness iframe' };
        }
        const ch = win.chart;
        const rs = ch && ch.replaySystem;
        if (!ch || !rs) return { ok: false, reason: 'chart/replaySystem missing' };
        try {
          if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
            rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
          }
          if (typeof rs.seekToIndex === 'function' && Array.isArray(ch.data) && ch.data.length > 10) {
            rs.seekToIndex(Math.max(0, Math.floor(ch.data.length * 0.1)));
          }
          let method = 'unavailable';
          if (typeof rs.setSpeed === 'function') { rs.setSpeed(targetSpeed); method = 'setSpeed'; }
          else if ('speed' in rs) { rs.speed = targetSpeed; method = 'speed-property'; }
          if (typeof rs.play === 'function') rs.play();
          else if (typeof rs.togglePlay === 'function') rs.togglePlay();
          const armDeadline = Date.now() + 4000;
          while (Date.now() < armDeadline) {
            if (rs.isPlaying || rs.passivePlayActive) break;
            if (typeof rs.play === 'function') rs.play();
            else if (typeof rs.togglePlay === 'function') rs.togglePlay();
            await new Promise((r) => setTimeout(r, 50));
          }
          const arm = {
            ok: !!(rs.isPlaying || rs.passivePlayActive || rs.isActive),
            requestedSpeed: targetSpeed,
            nearestSpeed: Number(rs.speed) || null,
            method,
            isPlaying: !!rs.isPlaying,
            passivePlayActive: !!rs.passivePlayActive,
          };
          if (!arm.ok) return { ok: false, reason: 'failed to arm replay', arm };
          const before = p.snapshot();
          // Observe window: rAF loop + setTimeout fallback (rAF-only hangs if
          // headless throttles frames before play truly starts).
          const observeUntil = Date.now() + observeMs;
          await new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            let frames = 0;
            function tick() {
              frames += 1;
              if (Date.now() >= observeUntil || frames > (observeMs + 120)) return finish();
              requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
            setTimeout(finish, observeMs + 1500);
          });
          try {
            if (typeof rs.pause === 'function') rs.pause();
            else if (typeof rs.stop === 'function') rs.stop();
            else if (typeof rs.togglePlay === 'function' && rs.isPlaying) rs.togglePlay();
            if (typeof rs.setSpeed === 'function') rs.setSpeed(1);
          } catch (_) {}
          // Drain a few frames after pause before snapshot.
          await new Promise((r) => {
            let n = 0;
            function drain() {
              n += 1;
              if (n >= 5) return r();
              requestAnimationFrame(drain);
            }
            requestAnimationFrame(drain);
          });
          const after = p.snapshot();
          return { ok: true, arm, before, after };
        } catch (error) {
          return { ok: false, reason: String(error && error.message || error) };
        }
      }`,
      speed,
      Math.min(observeMs, 12_000),
    );
    if (!capture || capture.ok !== true) {
      throw new Error(`ceiling capture failed: ${capture?.reason || JSON.stringify(capture)}`);
    }
    const arm = capture.arm;
    const probeDelta = deltaProbeSnapshots(capture.before, capture.after);
    const profile = {
      sampleCount: probeDelta.stackRows.length,
      totalSelfMs: probeDelta.callbackBusyMs,
      topCalls: probeDelta.stackRows.map((row) => ({
        functionName: row.key,
        url: '',
        lineNumber: null,
        selfMs: Number(row.selfMs.toFixed(3)),
        hitCount: 1,
        callUID: row.key,
        ratio: probeDelta.callbackBusyMs > 0
          ? Number((row.selfMs / probeDelta.callbackBusyMs).toFixed(4))
          : 0,
      })),
    };
    const pageObs = {
      longtaskMs: probeDelta.longTaskDurationMs,
      paintCount: probeDelta.canvasPaintCalls,
      wallMs: probeDelta.wallMs,
      canvasPaintMs: probeDelta.canvasPaintMs,
    };
    const timeline = categoriesFromProbeDelta(probeDelta);
    const report = {
      signature: PO_CPU_CEILING_SIGNATURE,
      meta: {
        speedRequested: speed,
        speedNearest: arm.nearestSpeed,
        observeMs,
        harness: 'po-cpu-ab-host.html',
        method: arm.method,
        collectors: ['poCpuAbProbe.stacks', 'poCpuAbProbe.canvasPaint', 'longtask'],
        note: 'Ceiling via extended PO-CPU-AB probe (callback stacks + canvas paint ms). CDP Profiler/Tracing unused.',
      },
      arm,
      timeline,
      profile,
      pageObs,
      probeDelta,
      summaryText: null,
    };
    report.summaryText = formatCeilingProfileSummary(report);

    const cells = assertCeilingProfileReport(report);
    const ok = cells.every((c) => c.pass);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: PO_CPU_CEILING_SIGNATURE,
      error: ok ? null : cells.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join('; '),
      report,
      cells,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: PO_CPU_CEILING_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      cells: [],
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath },
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverHandle) await serverHandle.close().catch(() => {});
  }
}

function cell(name, pass, detail, evidence = {}) {
  return {
    name,
    pass: !!pass,
    status: pass ? 'GREEN' : 'RED',
    blocking: true,
    detail,
    evidence,
  };
}

export function assertCeilingProfileReport(report) {
  const cells = [];
  cells.push(cell(
    'PO-CPU-CEILING-REPORT-SHAPE',
    report?.signature === PO_CPU_CEILING_SIGNATURE
      && report?.timeline?.categories
      && report?.profile?.topCalls,
    report?.signature === PO_CPU_CEILING_SIGNATURE
      ? 'ceiling profile shape ok'
      : 'ceiling profile missing signature/timeline/profile',
  ));
  const cats = report?.timeline?.categories || {};
  const scripting = cats.scripting?.ratio;
  const rendering = cats.rendering?.ratio;
  const painting = cats.painting?.ratio;
  const named = Number.isFinite(scripting) && Number.isFinite(rendering) && Number.isFinite(painting);
  cells.push(cell(
    'PO-CPU-CEILING-CATEGORIES',
    named && (cats.scripting.ms + cats.rendering.ms + cats.painting.ms) > 0,
    named
      ? `scripting=${(scripting * 100).toFixed(1)}% rendering=${(rendering * 100).toFixed(1)}% painting=${(painting * 100).toFixed(1)}% system=${((cats.system?.ratio || 0) * 100).toFixed(1)}%`
      : 'timeline categories missing',
    { categories: cats },
  ));
  const top = report?.profile?.topCalls || [];
  cells.push(cell(
    'PO-CPU-CEILING-TOP-CALLS',
    top.length > 0 && Number(report?.profile?.sampleCount) > 0,
    top.length
      ? `top=${top[0].functionName} ${(top[0].ratio * 100).toFixed(1)}% samples=${report.profile.sampleCount}`
      : 'CPU profile empty',
    { topCalls: top.slice(0, 10), sampleCount: report?.profile?.sampleCount },
  ));
  const speedOk = Number(report?.meta?.speedNearest) >= 30
    || Number(report?.arm?.nearestSpeed) >= 30;
  cells.push(cell(
    'PO-CPU-CEILING-SPEED-ARMED',
    speedOk,
    speedOk
      ? `nearestSpeed=${report?.meta?.speedNearest ?? report?.arm?.nearestSpeed}`
      : `failed to arm high-speed replay (got ${report?.meta?.speedNearest ?? report?.arm?.nearestSpeed})`,
    { arm: report?.arm },
  ));
  return cells;
}
