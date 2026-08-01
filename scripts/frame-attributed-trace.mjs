#!/usr/bin/env node
/**
 * FRAME-ATTRIBUTED TRACE — the reconfigured instrument.
 *
 * Every previous trace of mine answered "what kind of work" and could not answer "whose work". Four chart
 * realms share one main thread, and `applyMultichartMirrorFrame` -> `_finishMultichartMirrorRender` calls a
 * synchronous `chart.render()` per panel, so those four run SERIALLY on that thread. If the main-thread load
 * splits roughly evenly across four realms, the fix is architectural and nothing single-panel touches it. No
 * trace CATEGORY can distinguish those two worlds; only frame attribution can.
 *
 * Six settings are mandatory on every artifact this writes, and the run VOIDS rather than publishes if any
 * of them cannot be read:
 *   per-frame attribution, JS sampling, rasteriser string, build stamp, panel count, replay speed engaged.
 *
 * Two arms:
 *   --arm=soak    attach read-only to the live soak (the heavy, real condition: ~65k bars, 4 realms)
 *   --arm=paired  boot a throwaway session and trace it TWICE, playing and paused, so idle cost is measured
 *                 against replay cost at an IDENTICAL bar count. Comparing a fresh idle page to a 65k-bar
 *                 soak would confound idle-versus-replay with 2k-versus-65k bars.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { findSoakBrowser, assertSameBrowser } from './lib/find-soak-port.mjs';
import { bootConf01Session } from './lib/conf01-session.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', 'soak');
const PORT = argOf('port', 'auto');
const TRACE_MS = Number(argOf('traceMs', '8000'));
const SAMPLE_US = Number(argOf('sampleUs', '200'));
const OUT = argOf('out', `c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\FRAME-TRACE-${ARM.toUpperCase()}-20260731.json`);
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
const TASKS = /^(RunTask|ThreadControllerImpl::RunTask)$/;

/** Read the six mandatory stamps. Anything unreadable is null and voids the artifact downstream. */
async function readStamps(page, browserCdp) {
  const perFrame = [];
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const ch = window.chart;
      const rs = ch && ch.replaySystem;
      if (!ch) return null;
      return {
        url: location.href.slice(0, 120),
        timeOrigin: Math.round(performance.timeOrigin),
        bars: Array.isArray(ch.data) ? ch.data.length : null,
        timeframe: ch.timeframe || ch.currentTimeframe || null,
        replayActive: !!(rs && rs.isActive),
        replayPlaying: !!(rs && rs.isPlaying),
        replayIndex: rs && rs.currentIndex != null ? Number(rs.currentIndex) : null,
        replaySpeed: rs && rs.speed != null ? Number(rs.speed) : (rs && rs.playbackSpeed != null ? Number(rs.playbackSpeed) : null),
        buildId: window.__TALARIA_CHART_BUILD_ID || null,
      };
    }).catch(() => null);
    if (r) perFrame.push(r);
  }
  let rasteriser = null;
  try {
    const info = await browserCdp.send('SystemInfo.getInfo');
    const gl = info?.gpu?.auxAttributes?.glRenderer || null;
    rasteriser = {
      glRenderer: gl,
      glVendor: info?.gpu?.auxAttributes?.glVendor || null,
      hardware: gl ? !/SwiftShader|Software|llvmpipe/i.test(gl) : null,
    };
  } catch { /* SystemInfo unavailable */ }
  return { perFrame, rasteriser };
}

const report = {
  signature: 'FRAME-ATTRIBUTED-TRACE-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  arm: ARM,
  bfcacheState: ARM === 'soak'
    ? 'default (enabled) — read-only attach to the running soak, no navigation occurs.'
    : 'default (enabled) — throwaway session, no reset axis is measured here.',
  whyThisExists: 'Four realms share one main thread and render serially. Categories cannot say whether the main-thread load is host-side or spread across panels, and that distinction decides whether the fix is one pipeline or the architecture.',
};

/** One trace + profile over the current state of `page`, fully attributed. */
async function traceOnce(page, label, traceMs) {
  const client = await page.createCDPSession();
  const events = [];
  const onData = (e) => { for (const ev of e.value) events.push(ev); };
  client.on('Tracing.dataCollected', onData);

  const pcdp = await page.createCDPSession().catch(() => null);
  if (pcdp) {
    await pcdp.send('Profiler.enable').catch(() => {});
    // JS SAMPLING ON, and dense: a "scripting" verdict without function names forces a second run.
    await pcdp.send('Profiler.setSamplingInterval', { interval: SAMPLE_US }).catch(() => {});
    await pcdp.send('Profiler.start').catch(() => {});
  }
  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      recordMode: 'recordAsMuchAsPossible',
      includedCategories: [
        // toplevel carries RunTask, which is the ONLY source of the task durations the blocking-time
        // calibration is defined over. It is kept and excluded from bucketing, not dropped.
        'toplevel',
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-devtools.timeline.stack',
        'v8', 'v8.execute', 'disabled-by-default-v8.gc',
      ],
    },
  });
  const t0 = Date.now();
  await sleep(traceMs);
  const ended = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await ended;
  client.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - t0;

  let profile = null;
  if (pcdp) {
    profile = (await pcdp.send('Profiler.stop').catch(() => null))?.profile || null;
    await pcdp.send('Profiler.disable').catch(() => {});
    await pcdp.detach().catch(() => {});
  }
  await client.detach().catch(() => {});

  // ---- frame token -> document, from the trace's own metadata -------------------------------------------
  const frameInfo = new Map();
  for (const e of events) {
    const d = e.args?.data;
    if (e.name === 'TracingStartedInBrowser' && Array.isArray(d?.frames)) {
      for (const f of d.frames) frameInfo.set(f.frame, { url: String(f.url || '').slice(0, 110), name: f.name || '', parent: f.parent || null });
    }
    if ((e.name === 'FrameCommittedInBrowser' || e.name === 'CommitLoad') && d?.frame) {
      frameInfo.set(d.frame, { url: String(d.url || '').slice(0, 110), name: d.name || '', parent: d.parent || null });
    }
  }

  // ---- busiest renderer main thread ---------------------------------------------------------------------
  const busy = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !(e.dur > 0)) continue;
    const k = `${e.pid}:${e.tid}`;
    busy.set(k, (busy.get(k) || 0) + e.dur);
  }
  const mainKey = [...busy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!mainKey) return { label, error: 'no threads in trace' };
  const [mpid, mtid] = mainKey.split(':').map(Number);
  const onMain = events.filter((e) => e.ph === 'X' && e.pid === mpid && e.tid === mtid && e.dur > 0).sort((a, b) => a.ts - b.ts || b.dur - a.dur);

  // ---- calibration: outermost tasks only, and the physical invariant ------------------------------------
  const rawTasks = onMain.filter((e) => TASKS.test(e.name));
  const tasks = [];
  let covered = -Infinity;
  for (const e of rawTasks) { if (e.ts < covered) continue; covered = e.ts + e.dur; tasks.push(e); }
  const sec = wallMs / 1000;
  const totalTaskMs = tasks.reduce((s, t) => s + t.dur, 0) / 1000;
  const blockingMs = tasks.filter((t) => t.dur > 50_000).reduce((s, t) => s + (t.dur - 50_000), 0) / 1000;

  // ---- self time per event, then category and FRAME buckets ---------------------------------------------
  const byCategory = new Map();
  const byFrame = new Map();
  const byFrameScripting = new Map();
  const unattributedByName = new Map();
  const unattributedByCat = new Map();
  const self = new Map();
  const st2 = [];
  for (const e of onMain) {
    while (st2.length && st2[st2.length - 1].end <= e.ts) {
      const done = st2.pop();
      self.set(done.e, done.e.dur - done.childDur);
    }
    if (st2.length) st2[st2.length - 1].childDur += e.dur;
    st2.push({ e, end: e.ts + e.dur, childDur: 0 });
  }
  while (st2.length) { const done = st2.pop(); self.set(done.e, done.e.dur - done.childDur); }

  // Frame of an event: its own, else the nearest ancestor that declares one.
  const frameStack = [];
  for (const e of onMain) {
    while (frameStack.length && frameStack[frameStack.length - 1].end <= e.ts) frameStack.pop();
    const own = e.args?.data?.frame || e.args?.frame || null;
    const inherited = own || (frameStack.length ? frameStack[frameStack.length - 1].frame : null);
    frameStack.push({ end: e.ts + e.dur, frame: inherited });

    const s = (self.get(e) || 0) / 1000;
    if (s <= 0) continue;
    const cat = TASKS.test(e.name) ? 'taskContainer' : categoryOf(e.name);
    byCategory.set(cat, (byCategory.get(cat) || 0) + s);
    const key = inherited || '(unattributed)';
    byFrame.set(key, (byFrame.get(key) || 0) + s);
    if (cat === 'scripting') byFrameScripting.set(key, (byFrameScripting.get(key) || 0) + s);
    if (!inherited) {
      unattributedByName.set(e.name, (unattributedByName.get(e.name) || 0) + s);
      unattributedByCat.set(cat, (unattributedByCat.get(cat) || 0) + s);
    }
  }

  const frameRows = [...byFrame.entries()].sort((a, b) => b[1] - a[1]).map(([k, ms]) => {
    const info = frameInfo.get(k);
    return {
      frame: k === '(unattributed)' ? k : k.slice(0, 8),
      // This is the FIRST url the trace recorded for the token. A document that navigated in-page after the
      // trace metadata was written keeps its old label, which is how the host frame of a chart session can
      // read "/login/". The token is still the right frame; only the name is stale.
      url: info ? info.url : (k === '(unattributed)' ? 'no frame declared by the event or any ancestor' : 'unknown frame token'),
      urlCaveat: info ? 'first URL recorded for this frame token; may predate an in-page navigation' : null,
      isHostDocument: info ? !info.parent : null,
      msPerSec: +(ms / sec).toFixed(1),
      scriptingMsPerSec: +((byFrameScripting.get(k) || 0) / sec).toFixed(1),
      percentOfAttributed: null,
    };
  });
  const attributedTotal = frameRows.filter((r) => r.frame !== '(unattributed)').reduce((s, r) => s + r.msPerSec, 0);
  for (const r of frameRows) r.percentOfAttributed = attributedTotal > 0 && r.frame !== '(unattributed)' ? +((r.msPerSec / attributedTotal) * 100).toFixed(1) : null;

  // The unattributed bucket is not a rounding error and must not be silently dropped from the denominator.
  // Quoting "the host is 91% of attributed time" while a third of the thread is unattributed would be a
  // choice of denominator dressed up as a finding, so the bound is published alongside the share.
  const unattributedMsPerSec = +((byFrame.get('(unattributed)') || 0) / sec).toFixed(1);
  const hostRow = frameRows.find((r) => r.isHostDocument === true);
  const totalSelf = [...byFrame.values()].reduce((s, v) => s + v, 0) / sec;
  const unattributed = {
    msPerSec: unattributedMsPerSec,
    percentOfThread: totalSelf > 0 ? +((unattributedMsPerSec / totalSelf) * 100).toFixed(1) : null,
    byCategory: Object.fromEntries([...unattributedByCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / sec).toFixed(1)])),
    topEvents: [...unattributedByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: k, msPerSec: +(v / sec).toFixed(1) })),
  };
  const hostBound = hostRow && totalSelf > 0 ? {
    hostShareIfUnattributedIsNotHost: +((hostRow.msPerSec / totalSelf) * 100).toFixed(1),
    hostShareOfAttributedOnly: hostRow.percentOfAttributed,
    panelShareUpperBoundIfAllUnattributedWerePanels: +(((totalSelf - hostRow.msPerSec) / totalSelf) * 100).toFixed(1),
  } : null;

  // ---- function names from the sampling profiler --------------------------------------------------------
  let topFunctions = null;
  let callers = null;
  let samples = 0;
  if (profile && Array.isArray(profile.nodes) && Array.isArray(profile.samples)) {
    samples = profile.samples.length;
    const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
    // AGGREGATE BY FUNCTION IDENTITY, NOT BY NODE ID. V8 emits one profile node per CALL PATH, so a single
    // hot function reached from four call sites appears as four rows of ~3.7% each and reads as a minor cost
    // when it is actually ~15%. The first version of this reader ranked node ids and understated the top
    // function by a factor of four.
    const hits = new Map();
    for (const id of profile.samples) {
      const cf = nodeById.get(id)?.callFrame || {};
      const key = `${cf.functionName || '(anonymous)'}|${String(cf.url || '').split('/').pop().slice(0, 60)}|${cf.lineNumber != null ? cf.lineNumber + 1 : ''}`;
      hits.set(key, (hits.get(key) || 0) + 1);
    }
    const rows = [...hits.entries()].map(([key, n]) => {
      const [fn, url, line] = key.split('|');
      return {
        fn,
        url,
        line: line ? Number(line) : null,
        callPaths: profile.nodes.filter((nd) => (nd.callFrame?.functionName || '(anonymous)') === fn && String(nd.callFrame?.url || '').endsWith(url)).length,
        selfPercent: +((n / samples) * 100).toFixed(1),
        selfMsPerSec: +((n / samples) * 1000).toFixed(1),
      };
    });
    rows.sort((a, b) => b.selfPercent - a.selfPercent);
    topFunctions = rows.slice(0, 18);

    // NAME THE WRITER. "set innerHTML is 16% of the thread" is a symptom; the deliverable is which product
    // function calls it. Profile nodes carry children, so the parent chain is recoverable by inversion.
    const parentOf = new Map();
    for (const n of profile.nodes) for (const c of (n.children || [])) parentOf.set(c, n.id);
    const label = (id) => {
      const cf = nodeById.get(id)?.callFrame || {};
      const u = String(cf.url || '').split('/').pop().slice(0, 44);
      return `${cf.functionName || '(anonymous)'}${u ? ` @ ${u}:${cf.lineNumber != null ? cf.lineNumber + 1 : '?'}` : ''}`;
    };
    const hitsByNode = new Map();
    for (const id of profile.samples) hitsByNode.set(id, (hitsByNode.get(id) || 0) + 1);
    callers = topFunctions.slice(0, 6).map((r) => {
      const nodes = profile.nodes.filter((n) => (n.callFrame?.functionName || '(anonymous)') === r.fn
        && String(n.callFrame?.url || '').split('/').pop().slice(0, 60) === r.url);
      const byCaller = new Map();
      for (const n of nodes) {
        const h = hitsByNode.get(n.id) || 0;
        if (!h) continue;
        const chain = [];
        let cur = parentOf.get(n.id);
        for (let d = 0; d < 4 && cur != null; d += 1) { chain.push(label(cur)); cur = parentOf.get(cur); }
        const key = chain.join('  <-  ') || '(no caller recorded)';
        byCaller.set(key, (byCaller.get(key) || 0) + h);
      }
      return {
        fn: `${r.fn} @ ${r.url}:${r.line}`,
        selfPercent: r.selfPercent,
        topCallers: [...byCaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([chain, n]) => ({ percentOfThisFunction: +((n / (profile.samples.filter((s) => nodes.some((x) => x.id === s)).length || 1)) * 100).toFixed(0), chain })),
      };
    });
  }

  return {
    label,
    wallMs,
    thread: { pid: mpid, tid: mtid },
    events: events.length,
    calibration: {
      tasks: tasks.length,
      unthresholdedTaskMsPerSec: +(totalTaskMs / sec).toFixed(1),
      blockingMsPerSec: +(blockingMs / sec).toFixed(1),
      physicallyPossible: (totalTaskMs / sec) <= 1000,
    },
    categoryMsPerSec: Object.fromEntries([...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / sec).toFixed(1)])),
    perFrameAttribution: frameRows,
    unattributed,
    hostBound,
    jsSampling: { samples, intervalUs: SAMPLE_US, topFunctions, callers },
  };
}

let browser = null;
let ownBrowser = false;
try {
  const puppeteer = await loadPuppeteer();
  let page = null;
  let browserCdp = null;
  let startIdentity = null;
  let soakPort = null;

  if (ARM === 'soak') {
    const soak = await findSoakBrowser(PORT === 'auto' ? [] : [Number(PORT)]);
    if (!soak) throw new Error('No live soak browser with a chart page found.');
    soakPort = soak.port;
    startIdentity = soak.identity;
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${soak.port}`, defaultViewport: null });
    const pages = await browser.pages();
    page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];
    browserCdp = await browser.target().createCDPSession();
    report.attachedTo = { port: soak.port, browserIdentity: soak.identity.slice(-12) };
  } else {
    const sess = await bootConf01Session({ replaySpeed: 5, headless: true, settleMs: 10_000, placeOrder: false });
    browser = sess.browser;
    page = sess.page;
    ownBrowser = true;
    browserCdp = sess.browserCdp || await browser.target().createCDPSession();
    report.session = { buildId: sess.conf01?.buildId ?? null, replaySpeed: sess.conf01?.replaySpeed ?? null };
  }

  const stampsBefore = await readStamps(page, browserCdp);
  const charts = stampsBefore.perFrame;
  const advancingBefore = charts.map((c) => c.replayIndex);

  if (ARM === 'soak') {
    report.traces = [await traceOnce(page, 'replay (live soak)', TRACE_MS)];
  } else {
    // Playing first, then paused, in the same session at the same bar count.
    const playing = await traceOnce(page, 'playing', TRACE_MS);
    const paused = await page.evaluate(() => {
      const out = [];
      const visit = (w) => { try { const rs = w.chart && w.chart.replaySystem; if (rs && typeof rs.pause === 'function') { rs.pause(); out.push(true); } } catch { /* cross-origin or absent */ } };
      visit(window);
      for (let i = 0; i < window.frames.length; i += 1) visit(window.frames[i]);
      return out.length;
    }).catch(() => 0);
    await sleep(8000); // let the paused state settle before measuring the floor
    // ASSERT THE PAUSE. The first version of this arm called pause() and trusted it. Its "idle" trace read
    // 816 ms/s of task time against 551 while playing - more work while stopped than while running - which is
    // not an idle page, and I would have published an always-on floor larger than the load it was meant to be
    // subtracted from. An idle arm is only idle if the replay index does not move during the trace.
    const idxBefore = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return rs && rs.currentIndex != null ? Number(rs.currentIndex) : null;
    }).catch(() => null);
    const idle = await traceOnce(page, 'idle (same session, replay paused)', TRACE_MS);
    const idxAfter = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return rs && rs.currentIndex != null ? Number(rs.currentIndex) : null;
    }).catch(() => null);
    report.pausedPanels = paused;
    report.idleArmCheck = {
      pausedPanels: paused,
      replayIndexBefore: idxBefore,
      replayIndexAfter: idxAfter,
      advancedDuringIdleTrace: idxBefore != null && idxAfter != null ? idxAfter - idxBefore : null,
      genuinelyIdle: idxBefore != null && idxAfter != null && idxAfter === idxBefore,
    };
    if (!report.idleArmCheck.genuinelyIdle) {
      report.idleArmVoided = `The idle arm is VOID: the replay index moved ${report.idleArmCheck.advancedDuringIdleTrace} during the trace (pause() reported ${paused} panels). Whatever it measured, it was not an idle page, and the always-on floor is NOT published from it.`;
    }
    report.traces = [playing, idle];
    if (playing.calibration && idle.calibration && report.idleArmCheck.genuinelyIdle) {
      report.idleVsReplay = {
        playingBlockingMsPerSec: playing.calibration.blockingMsPerSec,
        idleBlockingMsPerSec: idle.calibration.blockingMsPerSec,
        alwaysOnFraction: playing.calibration.blockingMsPerSec > 0
          ? +((idle.calibration.blockingMsPerSec / playing.calibration.blockingMsPerSec) * 100).toFixed(1) : null,
        playingTaskMsPerSec: playing.calibration.unthresholdedTaskMsPerSec,
        idleTaskMsPerSec: idle.calibration.unthresholdedTaskMsPerSec,
      };
    }
  }

  const stampsAfter = await readStamps(page, browserCdp);
  if (ARM === 'soak') {
    const still = await findSoakBrowser([soakPort]);
    assertSameBrowser(startIdentity, still?.identity);
  }

  // ---- THE SIX MANDATORY SETTINGS, asserted rather than hoped for ---------------------------------------
  const advancing = stampsAfter.perFrame.filter((c, i) => c.replayIndex != null && advancingBefore[i] != null && c.replayIndex > advancingBefore[i]).length;
  report.mandatory = {
    perFrameAttribution: (report.traces?.[0]?.perFrameAttribution || []).some((r) => r.frame !== '(unattributed)'),
    jsSampling: (report.traces?.[0]?.jsSampling?.samples || 0) > 0,
    rasteriserString: stampsBefore.rasteriser?.glRenderer || null,
    buildStamp: charts.map((c) => c.buildId).find((b) => b) || null,
    panelCount: charts.length,
    replaySpeedEngaged: ARM === 'soak'
      ? { advancingPanels: advancing, speeds: [...new Set(charts.map((c) => c.replaySpeed))], playingFlags: charts.filter((c) => c.replayPlaying).length }
      : { advancingPanels: advancing, speeds: [...new Set(charts.map((c) => c.replaySpeed))], playingFlags: charts.filter((c) => c.replayPlaying).length },
  };
  report.barsResident = charts.reduce((s, c) => s + (c.bars || 0), 0);
  report.perPanel = charts.map((c) => ({ url: c.url, timeframe: c.timeframe, bars: c.bars, timeOrigin: c.timeOrigin, playing: c.replayPlaying }));

  const missing = [];
  if (!report.mandatory.perFrameAttribution) missing.push('per-frame attribution');
  if (!report.mandatory.jsSampling) missing.push('JS sampling');
  if (!report.mandatory.rasteriserString) missing.push('rasteriser string');
  if (!report.mandatory.buildStamp) missing.push('build stamp');
  if (!report.mandatory.panelCount) missing.push('panel count');
  if (ARM === 'soak' && advancing < 1) missing.push('replay speed engaged (no panel advanced during the trace)');
  const cal = report.traces?.[0]?.calibration;
  if (cal && !cal.physicallyPossible) missing.push(`physical invariant (${cal.unthresholdedTaskMsPerSec} ms/s of task time on one thread)`);
  if (missing.length) report.voided = `Missing mandatory settings, so the artifact is not quotable: ${missing.join('; ')}.`;
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 1200);
} finally {
  try { if (browser) { if (ownBrowser) await browser.close(); else await browser.disconnect(); } } catch { /* already gone */ }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ arm: ARM, mandatory: report.mandatory, voided: report.voided, error: report.error }, null, 1));
