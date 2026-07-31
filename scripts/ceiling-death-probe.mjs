#!/usr/bin/env node
/**
 * CEILING-DEATH-PROBE — turn "the browser dies at about 1.4 GB" into a threshold with a distribution.
 *
 * Three runs have now ended with the browser process exiting code 1, no signal, Chrome's own stderr clean:
 * the ten-hour bend soak at 1,377.6 MB and the RESET-01 reload arm at 1,377.9 MB and again just past
 * 1,407.7 MB. That is the gating defect on this plan. It caps every long measurement at roughly ten
 * minutes, it makes the ruling's gigabyte-above-baseline state unreachable, and it sits BELOW the 1.5 GB
 * sessions the PO reports — which is the difference between shipping a leak and shipping a crash.
 *
 * An anecdote about a death is not actionable. This drives a CONF-01 session to death deliberately and
 * repeatedly, and for each death records:
 *   - the footprint at the last good reading, and the per-process composition behind it, so we know whether
 *     the renderer, the GPU process or the browser process is the one that runs out;
 *   - the exit code and signal, and Chrome's last words;
 *   - time to death, resident bars and closed trades, so the threshold can be stated per driver.
 *
 * It deliberately does NOT force garbage collection. A user's Chrome is not told to collect fifty times an
 * hour, and forcing it held the footprint 200 MB below where it would otherwise sit — which would move the
 * very threshold being measured.
 */
import fs from 'node:fs';
import os from 'node:os';

import { bootConf01Session, readConf01State, cycleTrades } from './lib/conf01-session.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BUDGET_HOURS = Number(argOf('budget-hours', 8));
const MAX_REPS = Number(argOf('reps', 40));
const SAMPLE_MS = Number(argOf('sample-ms', 20_000));
const REP_CAP_MIN = Number(argOf('rep-cap-min', 30));
const SPEED = Number(argOf('speed', 5));
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\CEILING-DEATH-20260731.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'CEILING-DEATH-PROBE-V1',
  artifactFile: OUT.split('\\').pop(),
  ruling: 'RESET-01 fallout — the ceiling is now the gating defect',
  question: 'At what total footprint does the browser die, is the threshold consistent, and which process runs out first?',
  bfcacheState: 'ENABLED (Chrome default). Not under test here; declared because RESET-01 requires it on every artifact.',
  design: {
    budgetHours: BUDGET_HOURS,
    maxReps: MAX_REPS,
    sampleMs: SAMPLE_MS,
    repCapMinutes: REP_CAP_MIN,
    speed: SPEED,
    forcedGc: 'NONE, deliberately. Forcing collection held footprint ~200 MB lower and would move the threshold being measured.',
  },
  startedAtIso: new Date().toISOString(),
  deaths: [],
  survivals: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
save();

/** One repetition: boot, drive heavy, and report how it ended. */
async function oneRep(rep) {
  const row = { rep, startedAtIso: new Date().toISOString() };
  let session = null;
  let browser = null;
  const chromeStderr = [];
  let death = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      replaySpeed: SPEED,
      placeOrder: false,
      label: `ceiling-death-${rep}`,
    });
    browser = session.browser;
    const { page, cdp, browserCdp } = session;
    row.buildStamp = session.conf01?.buildId ?? null;
    try {
      const proc = browser.process();
      row.browserPid = proc?.pid ?? null;
      proc?.stderr?.on('data', (d) => {
        const s = String(d).trim();
        if (s) chromeStderr.push(s.slice(0, 240));
        if (chromeStderr.length > 30) chromeStderr.shift();
      });
      proc?.on('exit', (code, signal) => { death = { exitCode: code, signal, atIso: new Date().toISOString() }; });
    } catch { /* best effort */ }

    const read = async () => {
      const info = await browserCdp.send('SystemInfo.getProcessInfo');
      const procs = info.processInfo || [];
      const fps = await readOsFootprints(procs.map((p) => p.id));
      const byType = {};
      let total = 0;
      for (const p of procs) {
        const mb = fps[p.id]?.privateMB || 0;
        total += mb;
        const t = String(p.type || 'other').toLowerCase();
        byType[t] = +((byType[t] || 0) + mb).toFixed(1);
      }
      const { metrics } = await cdp.send('Performance.getMetrics');
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
      const st = await readConf01State(page, { advanceWindowMs: 1_500 }).catch(() => null);
      return {
        totalPrivateMB: +total.toFixed(1),
        byProcessType: byType,
        processCount: procs.length,
        rendererCount: procs.filter((p) => /renderer/i.test(p.type)).length,
        largestRendererMB: +Math.max(0, ...procs.map((p) => (/renderer/i.test(p.type) ? (fps[p.id]?.privateMB || 0) : 0))).toFixed(1),
        jsHeapMB: m.JSHeapUsedSize ? +(m.JSHeapUsedSize / 1048576).toFixed(2) : null,
        documents: m.Documents ?? null,
        nodes: m.Nodes ?? null,
        residentBars: st?.totalBars ?? null,
        // Before this is escalated as a product defect it has to be separated from my own machine running
        // out of memory. Two other managers'' node processes were holding roughly 5 GB earlier today. If
        // deaths cluster where system free memory is low, the ceiling is environmental and the escalation
        // would be wrong.
        systemFreeMB: +(os.freemem() / 1048576).toFixed(0),
        systemTotalMB: +(os.totalmem() / 1048576).toFixed(0),
        minutes: +((Date.now() - (new Date(row.startedAtIso)).getTime()) / 60_000).toFixed(2),
      };
    };

    const deadline = Date.now() + REP_CAP_MIN * 60_000;
    let closes = 0;
    let last = null;
    while (Date.now() < deadline) {
      const t = await cycleTrades(page, { open: 1, close: 1, holdMs: 0 }).catch(() => null);
      closes += t?.closed || 0;
      await sleep(SAMPLE_MS);
      let cur = null;
      try {
        cur = await read();
      } catch (err) {
        row.endedBy = 'gauges stopped answering';
        row.gaugeError = String(err?.message || err).slice(0, 160);
        break;
      }
      cur.closedTrades = closes;
      last = cur;
      row.lastGoodReading = cur;
      console.error(`[ceiling] rep ${rep} ${cur.minutes}min ${cur.totalPrivateMB}MB renderer=${cur.largestRendererMB} gpu=${cur.byProcessType.gpu ?? '-'} heap=${cur.jsHeapMB} bars=${cur.residentBars} closes=${closes}`);
      save();
      if (death) { row.endedBy = 'browser process exited'; break; }
    }
    if (!row.endedBy) row.endedBy = 'reached the per-repetition cap without dying';
    row.finalReading = last;
  } catch (err) {
    row.endedBy = row.endedBy || 'threw during boot or drive';
    row.error = String(err?.message || err).slice(0, 200);
  } finally {
    // Give the exit handler a moment to fire before tearing down.
    await sleep(2_000);
    row.browserDeath = death;
    row.chromeStderrTail = chromeStderr.slice(-6);
    try { await browser?.close?.(); } catch { /* gone */ }
  }
  return row;
}

(async () => {
  const budgetEnd = Date.now() + BUDGET_HOURS * 3_600_000;
  for (let rep = 1; rep <= MAX_REPS && Date.now() < budgetEnd; rep += 1) {
    const row = await oneRep(rep);
    if (row.browserDeath || row.endedBy === 'gauges stopped answering') report.deaths.push(row);
    else report.survivals.push(row);
    save();
    console.error(`[ceiling] rep ${rep} ended: ${row.endedBy}  death=${JSON.stringify(row.browserDeath)}  atMB=${row.lastGoodReading?.totalPrivateMB}`);
    await sleep(5_000);
  }

  // ---- Grade the threshold -------------------------------------------------
  const at = report.deaths.map((d) => d.lastGoodReading?.totalPrivateMB).filter((v) => v != null);
  if (at.length) {
    const mean = at.reduce((s, v) => s + v, 0) / at.length;
    const sd = at.length > 1 ? Math.sqrt(at.reduce((s, v) => s + (v - mean) ** 2, 0) / (at.length - 1)) : null;
    const rend = report.deaths.map((d) => d.lastGoodReading?.largestRendererMB).filter((v) => v != null);
    const gpu = report.deaths.map((d) => d.lastGoodReading?.byProcessType?.gpu).filter((v) => v != null);
    const heap = report.deaths.map((d) => d.lastGoodReading?.jsHeapMB).filter((v) => v != null);
    report.threshold = {
      deaths: report.deaths.length,
      survivals: report.survivals.length,
      footprintAtDeathMB: at,
      meanFootprintAtDeathMB: +mean.toFixed(1),
      sdMB: sd != null ? +sd.toFixed(1) : null,
      consistent: sd != null ? sd < 100 : null,
      largestRendererAtDeathMB: rend,
      gpuAtDeathMB: gpu,
      jsHeapAtDeathMB: heap,
      minutesToDeath: report.deaths.map((d) => d.lastGoodReading?.minutes),
      residentBarsAtDeath: report.deaths.map((d) => d.lastGoodReading?.residentBars),
      closedTradesAtDeath: report.deaths.map((d) => d.lastGoodReading?.closedTrades),
      systemFreeAtDeathMB: report.deaths.map((d) => d.lastGoodReading?.systemFreeMB),
      systemFreeAtSurvivalMB: report.survivals.map((d) => d.lastGoodReading?.systemFreeMB),
      environmentalOrProduct: null,
      exitCodes: report.deaths.map((d) => d.browserDeath?.exitCode ?? null),
      signals: report.deaths.map((d) => d.browserDeath?.signal ?? null),
      // Which process is the one that runs out?
      dominantProcessAtDeath: (() => {
        const r = rend.length ? rend.reduce((s, v) => s + v, 0) / rend.length : 0;
        const g = gpu.length ? gpu.reduce((s, v) => s + v, 0) / gpu.length : 0;
        return r > g
          ? `the page RENDERER, averaging ${r.toFixed(1)} MB against ${g.toFixed(1)} MB in the GPU process`
          : `the GPU process, averaging ${g.toFixed(1)} MB against ${r.toFixed(1)} MB in the largest renderer`;
      })(),
      jsShare: heap.length && at.length
        ? `JS heap averages ${(heap.reduce((s, v) => s + v, 0) / heap.length).toFixed(1)} MB of a ${mean.toFixed(0)} MB total at death, so ${(100 * (heap.reduce((s, v) => s + v, 0) / heap.length) / mean).toFixed(0)}% of what kills us is JS and the rest is not.`
        : null,
    };
    report.verdict = `The browser dies at ${mean.toFixed(0)} MB total footprint${sd != null ? ` (sd ${sd.toFixed(0)} MB over ${at.length} deaths)` : ` (${at.length} death)`}, exit code ${[...new Set(report.deaths.map((d) => d.browserDeath?.exitCode))].join('/')}, after ${report.deaths.map((d) => d.lastGoodReading?.minutes).join('/')} minutes. ${report.threshold.dominantProcessAtDeath}. ${report.threshold.jsShare || ''}`;
  } else {
    report.verdict = `No death recorded in ${report.survivals.length} repetition(s). The ceiling did not reproduce under this configuration, which does not clear it — three earlier runs died at 1,377 to 1,408 MB — but it does mean it is not reached at every attempt and the trigger needs narrowing.`;
  }
  report.status = 'OK';
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
  save();
  console.error(`\n=== CEILING DEATH ===\n${report.verdict}\nartifact ${OUT}`);
})();
