#!/usr/bin/env node
/**
 * TICK-PROGRESS-PROBE-V1 — does tick mode make forward progress under CONF-01?
 *
 * The tick-mode decay run recorded ~85% of a core with the bar sum pinned at the resident
 * total and `advancing=0/4` for its whole length. Two explanations fit that:
 *
 *   (a) tick mode does not advance in this configuration, or
 *   (b) switching to tick MID-PLAY leaves playback stuck — a mode-switch defect, not a
 *       tick-mode defect.
 *
 * This probe discriminates by doing all three arms IN ONE SESSION, so machine state,
 * resident data and build are identical across them:
 *
 *   arm 1 CANDLE, set while paused, then play          — the control
 *   arm 2 TICK,   set while paused, then play          — "selected before play"
 *   arm 3 TICK,   set while already playing            — "selected after play" (the drain shape)
 *
 * Progress is judged from the product's own state, per realm, on three independent gauges
 * (`currentIndex`, `replayTimestamp`, resident bar count) because the peers advance by
 * timestamp and never by index — a single-gauge answer here would be wrong.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function controlSource({ mode, pauseFirst, play }) {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs) return null;
  const out = { steps: [] };
  const snap = () => ({
    mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    isPlaying: !!rs.isPlaying,
    idx: rs.currentIndex ?? null,
    simMs: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
    residentBars: Array.isArray(window.chart.data) ? window.chart.data.length : null,
    animatingCandle: !!rs.animatingCandle,
    hasTickInterval: rs.tickInterval != null,
    hasPlayInterval: rs.playInterval != null,
  });
  out.before = snap();
  if (pauseFirst) {
    try { if (typeof rs.pause === 'function') rs.pause(); } catch (_) {}
    out.steps.push({ paused: snap() });
  }
  if (mode) {
    try { rs.setPlaybackMode(mode, { restartPlayback: !pauseFirst }); } catch (e) {
      out.setError = String(e?.message || e).slice(0, 120);
    }
    out.steps.push({ modeSet: snap() });
  }
  if (play) {
    try { if (typeof rs.play === 'function') rs.play(); } catch (_) {}
    out.steps.push({ played: snap() });
  }
  out.after = snap();
  return out;
}

function probeSource() {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs) return null;
  return {
    tf: window.chart.currentTimeframe || null,
    mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    isPlaying: !!rs.isPlaying,
    idx: rs.currentIndex ?? null,
    simMs: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
    residentBars: Array.isArray(window.chart.data) ? window.chart.data.length : null,
    animatingCandle: !!rs.animatingCandle,
    hasTickInterval: rs.tickInterval != null,
    hasPlayInterval: rs.playInterval != null,
    speed: rs.speed ?? null,
  };
}

async function everyRealm(page, fn, arg) {
  const rows = [];
  for (const frame of page.frames()) {
    try {
      const r = arg === undefined ? await frame.evaluate(fn) : await frame.evaluate(fn, arg);
      if (r) rows.push(r);
    } catch { /* frame gone */ }
  }
  return rows;
}

/** Judges progress on three gauges rather than one, per realm. */
export function gradeProgress(before, after, windowSec) {
  const perRealm = after.map((r, i) => {
    const w = before[i] || {};
    return {
      tf: r.tf,
      mode: r.mode,
      loopKind: r.loopKind,
      isPlaying: r.isPlaying,
      indexAdvance: (r.idx ?? 0) - (w.idx ?? 0),
      simMsAdvance: (r.simMs != null && w.simMs != null) ? r.simMs - w.simMs : null,
      residentBarsAdvance: (r.residentBars != null && w.residentBars != null)
        ? r.residentBars - w.residentBars : null,
      animatingCandle: r.animatingCandle,
      hasTickInterval: r.hasTickInterval,
      hasPlayInterval: r.hasPlayInterval,
    };
  });
  const anyProgress = perRealm.filter((p) => p.indexAdvance > 0
    || (p.simMsAdvance ?? 0) > 0 || (p.residentBarsAdvance ?? 0) > 0).length;
  return {
    windowSec,
    realms: perRealm.length,
    realmsWithAnyProgress: anyProgress,
    realmsAdvancingByIndex: perRealm.filter((p) => p.indexAdvance > 0).length,
    realmsAdvancingBySimTime: perRealm.filter((p) => (p.simMsAdvance ?? 0) > 0).length,
    realmsWithResidentGrowth: perRealm.filter((p) => (p.residentBarsAdvance ?? 0) > 0).length,
    hostIndexAdvance: perRealm[0]?.indexAdvance ?? null,
    stalled: anyProgress === 0,
    perRealm,
  };
}

async function runArm(page, cdp, { label, mode, pauseFirst, windowSec }) {
  const control = await everyRealm(page, controlSource, { mode, pauseFirst, play: true });
  await sleep(4_000);
  const cpu0 = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const before = await everyRealm(page, probeSource);
  await sleep(windowSec * 1000);
  const after = await everyRealm(page, probeSource);
  const cpu1 = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const t0 = (cpu0.metrics || []).find((m) => m.name === 'TaskDuration')?.value ?? null;
  const t1 = (cpu1.metrics || []).find((m) => m.name === 'TaskDuration')?.value ?? null;
  const grade = gradeProgress(before, after, windowSec);
  const arm = {
    label,
    modeRequested: mode,
    setWhilePaused: !!pauseFirst,
    control,
    cpuPercent: (t0 != null && t1 != null) ? +(((t1 - t0) / windowSec) * 100).toFixed(1) : null,
    grade,
  };
  console.error(`[tpp] ${label}: mode=${grade.perRealm.map((p) => p.mode).join(',')} loopKind=${grade.perRealm.map((p) => p.loopKind).join(',')} playing=${grade.perRealm.filter((p) => p.isPlaying).length}/${grade.realms} progress=${grade.realmsWithAnyProgress}/${grade.realms} (byIndex=${grade.realmsAdvancingByIndex} bySim=${grade.realmsAdvancingBySimTime} residentGrew=${grade.realmsWithResidentGrowth}) hostIdx+${grade.hostIndexAdvance} cpu=${arm.cpuPercent}% STALLED=${grade.stalled}`);
  return arm;
}

export async function runTickProgressProbe({ windowSec = 120, speed = 60, outPath = null } = {}) {
  const { browser, page, cdp } = await bootConf01Session({
    replaySpeed: speed,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
  });
  const report = {
    signature: 'TICK-PROGRESS-PROBE-V1',
    startedAtIso: new Date().toISOString(),
    question: 'does tick mode advance, and does selecting it mid-play differ from selecting it while paused?',
    plan: { windowSec, speed },
    arms: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return s ? s[1] : null;
    }).catch(() => null);
    report.zeroTrades = await readConf01State(page, { advanceWindowMs: 1_000 })
      .then((s) => (s?.panels || []).map((p) => p.closedTrades)).catch(() => null);
    console.error(`[tpp] build=${report.build} closedTrades=${JSON.stringify(report.zeroTrades)}`);

    report.arms.push(await runArm(page, cdp, { label: 'candle, set while paused', mode: 'candle', pauseFirst: true, windowSec }));
    save();
    report.arms.push(await runArm(page, cdp, { label: 'tick, set while paused', mode: 'tick', pauseFirst: true, windowSec }));
    save();
    // Back to candle first so the third arm is a genuine mid-play tick switch.
    await runArm(page, cdp, { label: 'candle again (re-arm for the mid-play switch)', mode: 'candle', pauseFirst: true, windowSec: 20 });
    report.arms.push(await runArm(page, cdp, { label: 'tick, set while already playing', mode: 'tick', pauseFirst: false, windowSec }));
    save();

    const [candle, tickPaused, tickMidPlay] = report.arms;
    report.verdict = {
      candleAdvances: candle.grade.realmsWithAnyProgress > 0,
      tickSelectedWhilePausedAdvances: tickPaused.grade.realmsWithAnyProgress > 0,
      tickSelectedMidPlayAdvances: tickMidPlay.grade.realmsWithAnyProgress > 0,
      hostIndexAdvance: {
        candle: candle.grade.hostIndexAdvance,
        tickWhilePaused: tickPaused.grade.hostIndexAdvance,
        tickMidPlay: tickMidPlay.grade.hostIndexAdvance,
      },
      cpuPercent: {
        candle: candle.cpuPercent, tickWhilePaused: tickPaused.cpuPercent, tickMidPlay: tickMidPlay.cpuPercent,
      },
      answer: (() => {
        const c = candle.grade.realmsWithAnyProgress > 0;
        const tp = tickPaused.grade.realmsWithAnyProgress > 0;
        const tm = tickMidPlay.grade.realmsWithAnyProgress > 0;
        if (!c) return 'VOID — the candle control did not advance either, so this session cannot judge tick';
        if (!tp && !tm) return 'TICK MODE DOES NOT ADVANCE under CONF-01, however it is selected, while burning CPU';
        if (tp && !tm) return 'MODE-SWITCH DEFECT — tick advances when selected while paused but not when selected mid-play';
        if (!tp && tm) return 'tick advances only when selected mid-play — inverse of the drain hypothesis';
        return 'tick advances in both selections; the stall in the decay run has another cause';
      })(),
    };
    console.error(`[tpp] ANSWER: ${report.verdict.answer}`);
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
    if (k === 'window-sec') o.windowSec = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /tick-progress-probe\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runTickProgressProbe(parseArgs(process.argv.slice(2)));
