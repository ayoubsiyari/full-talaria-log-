#!/usr/bin/env node
/**
 * BAR-EVICTION-PROBE-V1 — B4 of the overnight battery (ruling 776923bde, `EVICT-03`).
 *
 * One question: **does anything ever release a bar?** Play forward hard, then ask whether bars
 * far behind the playhead and far outside the viewport are still resident.
 *
 * Both possible answers are findings, and the instrument is built to be able to report either:
 *   - resident count never falls  → "nothing is ever released"
 *   - resident count plateaus     → "there is a cap", and then the cap's size is the question,
 *                                   because a cap of five million bars is not eviction
 *
 * The gauge is deliberately three-fold, because "resident" has three meanings here and quoting
 * the wrong one is how this gets misread: the primary series the chart draws from (`chart.data`),
 * the panel's full raw master (`_panelFullRawData`), and the raw feed array (`chart.rawData`).
 * Eviction that only trims the drawing series while the master keeps everything is not eviction.
 *
 * MEAS-02: this reads array lengths and viewport indices from the product. It cannot see whether
 * released bars are actually freed by V8 (that needs a heap snapshot), so a fall in resident
 * count is evidence of *dereferencing*, not proof of collection.
 */
import fs from 'node:fs';

import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function residencySource() {
  const ch = window.chart;
  if (!ch) return null;
  const rs = ch.replaySystem;
  const data = Array.isArray(ch.data) ? ch.data : null;
  const first = data && data.length ? data[0] : null;
  const last = data && data.length ? data[data.length - 1] : null;
  const tOf = (b) => (b && (b.t ?? b.time ?? b.timestamp ?? null)) ?? null;
  const idx = rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null;
  // The product's names are visibleStartIndex/visibleEndIndex (chart.js ~27293). My first pass
  // guessed viewStartIndex/_viewStart, which read null all through the 03:53 run and cost the
  // viewport half of EVICT-03 in it. Old names kept as fallbacks only.
  const viewStart = ch.visibleStartIndex ?? ch.viewStartIndex ?? ch._viewStart ?? null;
  const viewEnd = ch.visibleEndIndex ?? ch.viewEndIndex ?? ch._viewEnd ?? null;
  return {
    realm: `${location.pathname}${location.search}`.slice(-52),
    timeframe: ch.currentTimeframe ? String(ch.currentTimeframe) : null,
    mode: rs && typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: rs && typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    residentPrimary: data ? data.length : null,
    residentRaw: Array.isArray(ch.rawData) ? ch.rawData.length : null,
    residentPanelMaster: Array.isArray(ch._panelFullRawData) ? ch._panelFullRawData.length : null,
    playheadIndex: idx,
    viewStart: Number.isFinite(viewStart) ? viewStart : null,
    viewEnd: Number.isFinite(viewEnd) ? viewEnd : null,
    visibleBars: (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart)
      ? viewEnd - viewStart : null,
    // How stale is the oldest thing we are still holding?
    barsBehindPlayhead: idx != null ? idx : null,
    barsBehindViewport: Number.isFinite(viewStart) ? viewStart : null,
    oldestResidentTime: tOf(first),
    newestResidentTime: tOf(last),
    spanMs: (tOf(last) != null && tOf(first) != null) ? Number(tOf(last)) - Number(tOf(first)) : null,
    indicatorSeriesLengths: (() => {
      const active = (ch.indicators && ch.indicators.active) || [];
      const out = [];
      for (const ind of active.slice(0, 8)) {
        for (const k of Object.keys(ind || {})) {
          const v = ind[k];
          if (Array.isArray(v) && v.length > 50 && typeof v[0] === 'number') out.push({ key: k, len: v.length });
        }
      }
      return out.slice(0, 10);
    })(),
  };
}

async function readAll(page) {
  const rows = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length; i += 1) {
    try {
      const r = await frames[i].evaluate(residencySource);
      // The three peer panels share an identical URL suffix, so the URL is NOT a realm identity.
      // The 03:53 run keyed on it and silently merged three panels into one series, which
      // manufactured 26 "releases" out of a series hopping between different panels' counts.
      // The frame ordinal plus the timeframe is unique.
      if (r) rows.push({ ...r, frameIndex: i, realmKey: `f${i}|${r.timeframe || '?'}` });
    } catch { /* frame gone */ }
  }
  return rows;
}

/** Never-falls versus plateau, per realm, on all three residency gauges. */
export function gradeEviction(series) {
  const byRealm = new Map();
  for (const s of series) {
    for (const r of s.rows) {
      const key = r.realmKey || `f${r.frameIndex ?? '?'}|${r.timeframe || '?'}`;
      if (!byRealm.has(key)) byRealm.set(key, []);
      byRealm.get(key).push({ ...r, atMinutes: s.atMinutes });
    }
  }
  const gauges = ['residentPrimary', 'residentRaw', 'residentPanelMaster'];
  const perRealm = [];
  for (const [realm, rows] of byRealm) {
    const entry = { realm, timeframe: rows.at(-1)?.timeframe ?? null, samples: rows.length, gauges: {} };
    for (const g of gauges) {
      const vals = rows.map((r) => r[g]).filter((v) => Number.isFinite(v));
      if (vals.length < 3) { entry.gauges[g] = { verdict: 'INSUFFICIENT', samples: vals.length }; continue; }
      const first = vals[0];
      const last = vals.at(-1);
      const max = Math.max(...vals);
      // A drop of more than 1% of the running maximum is a release, not sampling jitter.
      let releases = 0;
      let largestDropPercent = 0;
      for (let i = 1; i < vals.length; i += 1) {
        const drop = vals[i - 1] - vals[i];
        if (drop > 0 && drop / Math.max(1, vals[i - 1]) > 0.01) {
          releases += 1;
          largestDropPercent = Math.max(largestDropPercent, +((drop / vals[i - 1]) * 100).toFixed(1));
        }
      }
      // Plateau: the last third barely moves while the first third grew.
      const third = Math.max(1, Math.floor(vals.length / 3));
      const growthEarly = vals[third] - vals[0];
      const growthLate = last - vals[vals.length - 1 - third];
      const plateaued = growthEarly > 0 && growthLate <= Math.max(2, growthEarly * 0.1);
      entry.gauges[g] = {
        first, last, max, growth: last - first, releases, largestDropPercent, plateaued,
        verdict: releases > 0
          ? (plateaued ? 'RELEASES AND PLATEAUS' : 'RELEASES')
          : (plateaued ? 'CAPPED — plateaus with nothing released' : 'NEVER RELEASED — monotonic'),
      };
    }
    const lastRow = rows.at(-1);
    entry.stalenessAtEnd = {
      barsBehindPlayhead: lastRow?.barsBehindPlayhead ?? null,
      barsBehindViewport: lastRow?.barsBehindViewport ?? null,
      visibleBars: lastRow?.visibleBars ?? null,
      residentPrimary: lastRow?.residentPrimary ?? null,
      // The EVICT-03 question in one number: how many resident bars are behind the viewport?
      residentButOffscreenBehind: (Number.isFinite(lastRow?.viewStart)) ? lastRow.viewStart : null,
      spanDays: lastRow?.spanMs != null ? +(lastRow.spanMs / 86_400_000).toFixed(1) : null,
    };
    perRealm.push(entry);
  }
  const primary = perRealm.map((p) => p.gauges.residentPrimary?.verdict).filter(Boolean);
  return {
    perRealm,
    anyRealmReleases: perRealm.some((p) => gauges.some((g) => (p.gauges[g]?.releases || 0) > 0)),
    allMonotonic: primary.length > 0 && primary.every((v) => v === 'NEVER RELEASED — monotonic'),
    answer: (() => {
      if (!primary.length) return 'INDETERMINATE — no realm produced enough samples';
      if (primary.every((v) => v.startsWith('NEVER RELEASED'))) {
        return 'NOTHING IS EVER RELEASED — resident bars are monotonic in every realm while playing forward';
      }
      if (primary.some((v) => v.startsWith('CAPPED'))) return 'THERE IS A CAP — resident bars plateau without release; the cap size is the question';
      return 'SOMETHING RELEASES — at least one realm sheds resident bars';
    })(),
  };
}

export async function runBarEvictionProbe({ minutes = 14, speed = 60, outPath = null } = {}) {
  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
  });
  const report = {
    signature: 'BAR-EVICTION-PROBE-V1',
    startedAtIso: new Date().toISOString(),
    ruling: '776923bde B4 / EVICT-03',
    scopeNote: 'A fall in resident count is evidence of dereferencing, not proof of collection; that needs a heap snapshot.',
    plan: { minutes, speed },
    series: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return s ? s[1] : null;
    }).catch(() => null);
    report.conf01 = { compliant: conf01?.compliant, failed: conf01?.failed };
    const st0 = await readConf01State(page, { advanceWindowMs: 1_500 }).catch(() => null);
    report.zeroTrades = (st0?.panels || []).map((p) => p.closedTrades);
    console.error(`[b4] build=${report.build} closedTrades=${JSON.stringify(report.zeroTrades)}`);

    const startedAt = Date.now();
    let n = 0;
    while ((Date.now() - startedAt) / 60_000 < minutes) {
      n += 1;
      const rows = await readAll(page);
      const st = await readConf01State(page, { advanceWindowMs: 2_000 }).catch(() => null);
      report.series.push({
        n, atMinutes: +((Date.now() - startedAt) / 60_000).toFixed(2),
        advancingPanels: st?.advancingPanels ?? null,
        rows,
      });
      const host = rows[0] || {};
      console.error(`[b4] #${n} ${((Date.now() - startedAt) / 60_000).toFixed(1)}min host tf=${host.timeframe} mode=${host.mode} playhead=${host.playheadIndex} resident=${host.residentPrimary}/raw=${host.residentRaw}/master=${host.residentPanelMaster} viewStart=${host.viewStart} behindViewport=${host.barsBehindViewport} advancing=${st?.advancingPanels}/4`);
      save();
      if ((st?.advancingPanels ?? 0) < 4) {
        const k = await keepConf01Playing(page, speed).catch(() => null);
        if (k && k.reseeksThatDidNotMove) {
          console.error(`[b4] WARNING ${k.reseeksThatDidNotMove} re-seek(s) did not move the playhead`);
        }
      }
      await sleep(30_000);
    }
    report.grade = gradeEviction(report.series);
    report.verdict = {
      answer: report.grade.answer,
      perRealmPrimary: report.grade.perRealm.map((p) => ({
        tf: p.timeframe,
        verdict: p.gauges.residentPrimary?.verdict ?? null,
        first: p.gauges.residentPrimary?.first ?? null,
        last: p.gauges.residentPrimary?.last ?? null,
        releases: p.gauges.residentPrimary?.releases ?? null,
        residentButOffscreenBehind: p.stalenessAtEnd.residentButOffscreenBehind,
        visibleBars: p.stalenessAtEnd.visibleBars,
        spanDays: p.stalenessAtEnd.spanDays,
      })),
    };
    console.error(`[b4] VERDICT ${report.verdict.answer}`);
    console.error(`[b4] per realm: ${JSON.stringify(report.verdict.perRealmPrimary)}`);
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
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /bar-eviction-probe\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runBarEvictionProbe(parseArgs(process.argv.slice(2)));
