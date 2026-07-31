#!/usr/bin/env node
/**
 * CONF01-BASELINE-GATE — the post-fix `CONF-01` baseline, which `GATE-PHASE4` turns into the gate on a
 * 665-hour decision.
 *
 * Phase 4's entire remaining case is one number: **497 MB of native cost attributed to four browser realms**,
 * measured on b116 before A's journal fix. This re-measures it on the current build. Three defects in how
 * that 497 was derived have to be fixed first, because a stale number and a mis-scoped number are equally
 * expensive at this price.
 *
 *   1. IT COMPARED TWO DIFFERENT SCOPES. The residual was `pageRendererPrivateMB` minus a JS heap read from
 *      the page's isolate. But `pageRendererPrivateMB` is the LARGEST SINGLE renderer process, and
 *      `Performance.getMetrics` reports one isolate. If the four realms occupy more than one renderer
 *      process, that subtraction mixes a one-process numerator with a one-isolate subtrahend. Here every
 *      renderer process is summed, and JS heap is summed across every isolate.
 *
 *   2. THE WORKER HEAP ROW WAS `null`. Two worker isolates existed and were UNMEASURED, so their bytes sat
 *      inside the 497 and were counted as native cost. They are read per-isolate here.
 *
 *   3. IT WAS TAKEN AFTER A FORCED COLLECTION ONLY. A user never gets a forced GC. Both readings are taken
 *      and both are reported, so the gate cannot be argued from whichever is more convenient.
 *
 * WHAT THE ANSWER DECIDES. Phase 4 buys baseline memory and nothing else — the 14:00 ruling established that
 * 92% of painting is host-side and survives the collapse. So the prize is the part of the footprint that
 * exists BECAUSE there are four realms rather than one. JS heap is NOT that part: collapsing four realms
 * into one still holds four datasets. Per-realm native overhead IS. Reporting them separately is the whole
 * point of this run.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const REPS = Number(argOf('reps', 5));
const SETTLE_MS = Number(argOf('settle-ms', 20_000));
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\CONF01-BASELINE-GATE-20260731.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'CONF01-BASELINE-GATE-V1',
  artifactFile: OUT.split('\\').pop(),
  ruling: 'GATE-PHASE4 from the 15:55 ruling: the cheap measurement runs before the 665-hour commitment',
  bfcacheState: 'ENABLED (Chrome default). Irrelevant to a first-paint baseline — no navigation occurs — but declared because RESET-01 requires it on every artifact.',
  forcedGcConfound: 'AVOIDED AND DECLARED. Every rep reports a LIVE reading taken before any collection and a POST-GC reading after one. The previous census reported post-GC only, and the arm the Director voided this afternoon was perturbed by a forced collection every twelve seconds.',
  premiseUnderTest: {
    figure: '497.23 MB non-JS renderer residual',
    measuredOn: 'b116, before A journal fix',
    derivation: 'largest single renderer process (693.8) minus page-isolate heap (186.66) + canvas floor (4.16) + image floor (5.75), with the worker heap row null/UNMEASURED',
    whyItIsBeingRedone: 'It gates 665 hours, it predates the biggest memory fix of the week, and its numerator and subtrahend have different scopes.',
  },
  startedAtIso: new Date().toISOString(),
  reps: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
save();

/** Canvas backing-store floor, 4 bytes per device pixel, per frame. */
const canvasFloorSource = () => {
  let bytes = 0;
  let n = 0;
  const dpr = window.devicePixelRatio || 1;
  for (const c of document.querySelectorAll('canvas')) {
    const w = c.width || Math.round((c.clientWidth || 0) * dpr);
    const h = c.height || Math.round((c.clientHeight || 0) * dpr);
    if (w > 0 && h > 0) { bytes += w * h * 4; n += 1; }
  }
  return { canvases: n, floorMB: +(bytes / 1048576).toFixed(2) };
};

/**
 * JS heap across EVERY isolate, deduplicated by target.
 *
 * Same-origin iframes sharing a process share the isolate and do NOT appear as separate targets, so the
 * page target's figure already covers them and nothing is double counted. Out-of-process iframes and
 * workers each own an isolate and each appear as their own target, so each is read directly.
 */
async function readAllIsolateHeaps(browserCdp, pageCdp) {
  const out = { isolates: [], totalHeapMB: 0, unreadable: [], route: {} };
  // The page's own isolate.
  try {
    const { metrics } = await pageCdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const mb = m.JSHeapUsedSize ? +(m.JSHeapUsedSize / 1048576).toFixed(2) : null;
    if (mb != null) {
      out.isolates.push({ kind: 'page', heapMB: mb, via: 'Performance.getMetrics' });
      out.totalHeapMB += mb;
    }
    out.documents = m.Documents ?? null;
    out.frames = m.Frames ?? null;
    out.nodes = m.Nodes ?? null;
    out.listeners = m.JSEventListeners ?? null;
  } catch (err) { out.unreadable.push(`page: ${String(err?.message || err).slice(0, 70)}`); }

  const readViaFlattenedSession = async (targetId) => {
    const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId, flatten: true });
    const conn = typeof browserCdp.connection === 'function' ? browserCdp.connection() : null;
    const session = conn && typeof conn.session === 'function' ? conn.session(sessionId) : null;
    if (!session) throw new Error('no flattened session');
    try { return await session.send('Runtime.getHeapUsage'); }
    finally { await browserCdp.send('Target.detachFromTarget', { sessionId }).catch(() => {}); }
  };

  try {
    const { targetInfos } = await browserCdp.send('Target.getTargets');
    const own = (targetInfos || []).filter((t) => /worker|iframe/i.test(t.type));
    out.otherTargets = own.map((t) => ({ type: t.type, url: String(t.url || '').slice(-60) }));
    for (const t of own) {
      try {
        const usage = await readViaFlattenedSession(t.targetId);
        const mb = +(usage.usedSize / 1048576).toFixed(2);
        out.isolates.push({ kind: t.type, url: String(t.url || '').slice(-60), heapMB: mb, via: 'flattened-session' });
        out.totalHeapMB += mb;
      } catch (err) {
        out.unreadable.push(`${t.type}: ${String(err?.message || err).slice(0, 70)}`);
      }
    }
  } catch (err) { out.unreadable.push(`targets: ${String(err?.message || err).slice(0, 70)}`); }

  out.totalHeapMB = +out.totalHeapMB.toFixed(2);
  out.isolateCount = out.isolates.length;
  return out;
}

/** Every process, by type, with renderers summed rather than maximised. */
async function readProcesses(browserCdp) {
  const info = await browserCdp.send('SystemInfo.getProcessInfo');
  const procs = info.processInfo || [];
  const fps = await readOsFootprints(procs.map((p) => p.id));
  const rows = [];
  let total = 0;
  const byType = {};
  for (const p of procs) {
    const fp = fps[p.id];
    if (!fp) continue;
    const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
    rows.push({ pid: p.id, type: p.type, bucket: key, privateMB: fp.privateMB });
    total += fp.privateMB;
    byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
  }
  const renderers = rows.filter((r) => r.bucket === 'renderer').sort((a, b) => b.privateMB - a.privateMB);
  return {
    totalPrivateMB: +total.toFixed(1),
    byType,
    rendererCount: renderers.length,
    rendererPrivateSumMB: +renderers.reduce((t, r) => t + r.privateMB, 0).toFixed(1),
    largestRendererPrivateMB: renderers.length ? renderers[0].privateMB : null,
    rendererBreakdownMB: renderers.map((r) => r.privateMB),
    gpuPrivateMB: byType.gpu ?? null,
    browserPrivateMB: byType.browser ?? null,
    processRows: rows.length,
  };
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const ci95 = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  const half = 1.96 * sd / Math.sqrt(a.length);
  return [+(m - half).toFixed(1), +(m + half).toFixed(1)];
};

(async () => {
  for (let rep = 1; rep <= REPS; rep += 1) {
    let session = null;
    let browser = null;
    const row = { rep, startedAtIso: new Date().toISOString() };
    try {
      session = await bootConf01Session({
        indicators: PO_TWO_INDICATORS,
        speed: 60,
        // A baseline, so no order: an open position would make this a growth measurement.
        placeOrder: false,
        label: `baseline-gate-r${rep}`,
      });
      browser = session.browser;
      const { page, cdp, browserCdp } = session;
      row.buildStamp = session.conf01?.buildId ?? null;

      // First paint means settled, not "as early as possible". Panels are already awaited by the boot
      // helper; this settle lets late script and layout land so the number is not flatteringly early.
      await sleep(SETTLE_MS);

      const state = await readConf01State(page, { advanceWindowMs: 3_000 }).catch(() => null);
      row.realms = Array.isArray(state?.panels) ? state.panels.length : null;
      row.distinctTimeframes = session.conf01?.distinctTimeframes ?? null;
      row.distinctFileIds = session.conf01?.distinctFileIds ?? null;
      row.residentBars = state?.totalBars ?? null;
      row.indicatorsPerPanel = state?.indicatorsPerPanel ?? null;

      // ---- LIVE: no collection has been forced ----
      const liveHeaps = await readAllIsolateHeaps(browserCdp, cdp);
      const liveProcs = await readProcesses(browserCdp);
      let canvasFloor = 0;
      let canvasCount = 0;
      for (const f of page.frames()) {
        const c = await f.evaluate(canvasFloorSource).catch(() => null);
        if (c) { canvasFloor += c.floorMB; canvasCount += c.canvases; }
      }
      row.live = {
        totalPrivateMB: liveProcs.totalPrivateMB,
        rendererPrivateSumMB: liveProcs.rendererPrivateSumMB,
        largestRendererPrivateMB: liveProcs.largestRendererPrivateMB,
        rendererCount: liveProcs.rendererCount,
        rendererBreakdownMB: liveProcs.rendererBreakdownMB,
        gpuPrivateMB: liveProcs.gpuPrivateMB,
        browserPrivateMB: liveProcs.browserPrivateMB,
        jsHeapAllIsolatesMB: liveHeaps.totalHeapMB,
        isolateCount: liveHeaps.isolateCount,
        isolates: liveHeaps.isolates,
        heapUnreadable: liveHeaps.unreadable,
        documents: liveHeaps.documents,
        frames: liveHeaps.frames,
        nodes: liveHeaps.nodes,
        listeners: liveHeaps.listeners,
        canvasFloorMB: +canvasFloor.toFixed(2),
        canvasCount,
      };
      row.live.nonJsRendererMB = +(liveProcs.rendererPrivateSumMB - liveHeaps.totalHeapMB - canvasFloor).toFixed(1);

      // ---- POST-GC: the same reading after a forced collection ----
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await sleep(3_000);
      const gcHeaps = await readAllIsolateHeaps(browserCdp, cdp);
      const gcProcs = await readProcesses(browserCdp);
      row.postGc = {
        totalPrivateMB: gcProcs.totalPrivateMB,
        rendererPrivateSumMB: gcProcs.rendererPrivateSumMB,
        rendererCount: gcProcs.rendererCount,
        gpuPrivateMB: gcProcs.gpuPrivateMB,
        jsHeapAllIsolatesMB: gcHeaps.totalHeapMB,
        isolateCount: gcHeaps.isolateCount,
        nonJsRendererMB: +(gcProcs.rendererPrivateSumMB - gcHeaps.totalHeapMB - canvasFloor).toFixed(1),
      };
      row.gcReleasedMB = +(row.live.totalPrivateMB - row.postGc.totalPrivateMB).toFixed(1);
      row.status = 'OK';
      console.error(`[gate] rep ${rep}: total ${row.live.totalPrivateMB} MB live / ${row.postGc.totalPrivateMB} post-GC | renderers ${row.live.rendererCount} summing ${row.live.rendererPrivateSumMB} | heap ${row.live.jsHeapAllIsolatesMB} across ${row.live.isolateCount} isolates | NON-JS ${row.live.nonJsRendererMB}`);
    } catch (err) {
      row.status = 'VOID';
      row.void = String(err?.message || err).slice(0, 220);
      console.error(`[gate] rep ${rep} VOID: ${row.void}`);
    } finally {
      try { await browser?.close?.(); } catch { /* gone */ }
    }
    report.reps.push(row);
    save();
    await sleep(6_000);
  }

  // ---- Grade against the premise and the bars -------------------------------
  const ok = report.reps.filter((r) => r.status === 'OK' && r.live?.totalPrivateMB);
  if (!ok.length) {
    report.status = 'VOID';
    report.void = 'no rep produced a reading';
  } else {
    const totals = ok.map((r) => r.live.totalPrivateMB);
    const nonJs = ok.map((r) => r.live.nonJsRendererMB);
    const heaps = ok.map((r) => r.live.jsHeapAllIsolatesMB);
    const rendSum = ok.map((r) => r.live.rendererPrivateSumMB);
    const gpus = ok.map((r) => r.live.gpuPrivateMB).filter((v) => v != null);
    const totalsGc = ok.map((r) => r.postGc?.totalPrivateMB).filter((v) => v != null);
    const mTotal = mean(totals);
    const mNonJs = mean(nonJs);
    report.baseline = {
      reps: ok.length,
      realms: [...new Set(ok.map((r) => r.realms))],
      buildStamps: [...new Set(ok.map((r) => r.buildStamp).filter(Boolean))],
      residentBarsMean: Math.round(mean(ok.map((r) => r.residentBars || 0))),
      totalFootprintMB: { mean: +mTotal.toFixed(1), ci95: ci95(totals), reps: totals },
      totalFootprintPostGcMB: totalsGc.length ? { mean: +mean(totalsGc).toFixed(1), ci95: ci95(totalsGc), reps: totalsGc } : null,
      rendererPrivateSumMB: { mean: +mean(rendSum).toFixed(1), ci95: ci95(rendSum) },
      rendererProcessCount: [...new Set(ok.map((r) => r.live.rendererCount))],
      rendererBreakdownMB: ok[0].live.rendererBreakdownMB,
      jsHeapAllIsolatesMB: { mean: +mean(heaps).toFixed(1), ci95: ci95(heaps) },
      isolateCount: [...new Set(ok.map((r) => r.live.isolateCount))],
      isolateDetail: ok[0].live.isolates,
      heapUnreadable: ok[0].live.heapUnreadable,
      gpuPrivateMB: gpus.length ? +mean(gpus).toFixed(1) : null,
      documents: [...new Set(ok.map((r) => r.live.documents))],
      nonJsRendererMB: { mean: +mNonJs.toFixed(1), ci95: ci95(nonJs), reps: nonJs },
    };
    const prior = 497.23;
    const priorTotal = 1122.1;
    report.gatePhase4 = {
      premise: `${prior} MB non-JS renderer cost on b116, pre journal fix`,
      nowMB: +mNonJs.toFixed(1),
      deltaVsPremiseMB: +(mNonJs - prior).toFixed(1),
      priorTotalMB: priorTotal,
      nowTotalMB: +mTotal.toFixed(1),
      deltaTotalMB: +(mTotal - priorTotal).toFixed(1),
      underOneGigabyte: mTotal < 1024,
      comfortablyUnderOneGigabyte: mTotal < 950,
      against500MbBar: +(mTotal - 500).toFixed(1),
      scopeCorrection: `The premise divided a ONE-PROCESS numerator by a ONE-ISOLATE subtrahend. Measured properly: ${[...new Set(ok.map((r) => r.live.rendererCount))].join('/')} renderer process(es) summing ${mean(rendSum).toFixed(1)} MB, against ${mean(heaps).toFixed(1)} MB of JS heap across ${[...new Set(ok.map((r) => r.live.isolateCount))].join('/')} isolate(s).`,
      whatPhase4CanActuallyRecover: `Phase 4 collapses realms, so it can only recover what exists BECAUSE there are four of them. JS heap is not that: four datasets survive the collapse. The recoverable pool is bounded above by the non-JS renderer figure of ${mNonJs.toFixed(1)} MB, and even that is an upper bound, because a single realm still needs DOM, style, compiled code and layer tiles for the same four charts.`,
    };
    // The premise was taken POST-GC, so the like-for-like comparison is post-GC. Comparing my live reading
    // against their collected one would manufacture a regression out of a methodology difference.
    const mTotalGc = totalsGc.length ? mean(totalsGc) : null;
    const nonJsGc = ok.map((r) => r.postGc?.nonJsRendererMB).filter((v) => v != null);
    const mNonJsGc = nonJsGc.length ? mean(nonJsGc) : null;
    report.gatePhase4.likeForLike = {
      note: 'The b116 premise (1,122.1 MB total, 497.23 MB non-JS) was recorded after a forced collection. The honest comparison is therefore against the POST-GC column here. The live column is the number a real user actually holds and is the one that matters for the bar.',
      priorTotalPostGcMB: priorTotal,
      nowTotalPostGcMB: mTotalGc != null ? +mTotalGc.toFixed(1) : null,
      deltaTotalPostGcMB: mTotalGc != null ? +(mTotalGc - priorTotal).toFixed(1) : null,
      priorNonJsMB: prior,
      nowNonJsPostGcMB: mNonJsGc != null ? +mNonJsGc.toFixed(1) : null,
      nonJsDeltaExplainedByScope: mNonJsGc != null
        ? `Any rise here is mostly SCOPE, not regression: the premise subtracted a one-isolate heap from the largest single renderer, while this sums every renderer process. Renderer sum ${mean(rendSum).toFixed(1)} MB against a largest-renderer figure of ${mean(ok.map((r) => r.live.largestRendererPrivateMB)).toFixed(1)} MB.`
        : null,
    };
    report.gatePhase4.journalFixEffect = mTotalGc != null && Math.abs(mTotalGc - priorTotal) < 60
      ? `A's journal fix did NOT materially move the CONF-01 chart baseline: ${priorTotal} MB then, ${mTotalGc.toFixed(1)} MB now, post-GC in both cases. That is consistent with my own census finding that the journal is not fetched during chart load on this account, so the 2.49 GB of decoded pixels the fix removed was never part of THIS baseline. The fix is real; it lands somewhere else.`
      : `The post-GC baseline moved from ${priorTotal} MB to ${mTotalGc != null ? mTotalGc.toFixed(1) : 'unknown'} MB.`;
    report.gatePhase4.verdict = mTotal < 950
      ? `The CONF-01 baseline is ${mTotal.toFixed(1)} MB, COMFORTABLY UNDER 1 GB. Per the 15:55 ruling that makes the remaining prize from a 665-hour refactor small, and Phase 4 should stay authorised for preconditions only.`
      : (mTotal < 1024
        ? `The CONF-01 baseline is ${mTotal.toFixed(1)} MB, under 1 GB but not comfortably. The prize is real but smaller than the 1,122 MB premise, and the 500 MB bar remains ${(mTotal - 500).toFixed(0)} MB away.`
        : `The CONF-01 baseline is ${mTotal.toFixed(1)} MB, still OVER 1 GB. The premise survives: baseline is not reachable without addressing per-realm cost.`);
    report.status = 'OK';
    console.error(`\n[gate] ${report.gatePhase4.verdict}`);
  }
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
  save();
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
